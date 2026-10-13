import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ANTHROPIC_API_KEY } from "@/lib/env";
import { refineBeats } from "@/lib/pipeline/ai";

type Beat = Record<string, unknown> & { narration?: string; visualPrompt?: string };

const narrationOf = (beats: Beat[]): string =>
  beats.map((b) => (b.narration ?? "").trim()).filter(Boolean).join(" ");

/** Compare a beat's content ignoring the derived visualPrompt field. */
const contentKey = (b: Beat): string => {
  const { visualPrompt: _ignored, ...rest } = b;
  return JSON.stringify(rest);
};

/**
 * Apply a plain-English change request to a finished video and queue a re-render.
 *
 * Work already paid for is carried forward: if the narration is unchanged the
 * voiceover, timestamps and lip-synced presenter clip are reused, and every beat
 * whose content is unchanged keeps its background prompt so the cached AI clip
 * is reused instead of regenerated.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Refining needs ANTHROPIC_API_KEY in .env" },
      { status: 501 }
    );
  }
  const { id } = await ctx.params;
  const { instruction } = (await req.json()) as { instruction?: string };
  if (!instruction?.trim()) {
    return NextResponse.json(
      { error: "Describe what to change, e.g. \"make the hook punchier and drop the stat\"" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lastJob = project.jobs[0];
  if (lastJob && (lastJob.state === "QUEUED" || lastJob.state === "RUNNING")) {
    return NextResponse.json(
      { error: "A render is already in progress — wait for it to finish." },
      { status: 409 }
    );
  }

  const oldBeats = JSON.parse(project.beatsJson) as Beat[];

  let refined;
  try {
    refined = await refineBeats({ beats: oldBeats, instruction: instruction.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not apply that change: ${(err as Error).message}`.slice(0, 300) },
      { status: 502 }
    );
  }

  // Keep the background prompt on any beat whose content survived the edit.
  const oldByContent = new Map(oldBeats.map((b) => [contentKey(b), b]));
  const newBeats: Beat[] = (refined.beats as Beat[]).map((b) => {
    const previous = oldByContent.get(contentKey(b));
    const carried = b.visualPrompt ?? previous?.visualPrompt;
    return carried ? { ...b, visualPrompt: carried } : b;
  });

  // Carry forward expensive artefacts only when their inputs are unchanged.
  const narrationUnchanged = narrationOf(newBeats) === narrationOf(oldBeats);
  const prev = lastJob ? (JSON.parse(lastJob.checkpointsJson) as Record<string, unknown>) : {};
  const carried: Record<string, unknown> = {};
  if (narrationUnchanged) {
    for (const k of [
      "ttsRelPath",
      "ttsDuration",
      "words",
      "klingRelPath",
      "loopRelPath",
      "lipsyncRelPath",
      "presenterRelPath",
    ]) {
      if (prev[k] !== undefined) carried[k] = prev[k];
    }
  }
  // The assembled background track always rebuilds (beat timings may shift),
  // but individual scene clips are cached on disk by prompt hash.

  await prisma.project.update({
    where: { id },
    data: { beatsJson: JSON.stringify(newBeats) },
  });
  const job = await prisma.job.create({
    data: {
      projectId: id,
      step: "Queued (refined)",
      checkpointsJson: JSON.stringify(carried),
    },
  });

  return NextResponse.json({
    jobId: job.id,
    changeNote: refined.changeNote,
    reusedVoiceover: narrationUnchanged,
  });
}
