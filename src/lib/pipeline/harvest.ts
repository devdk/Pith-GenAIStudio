import { prisma } from "../db";
import { ANTHROPIC_API_KEY } from "../env";
import { extractAudio, probeDurationSeconds } from "./ffmpeg";
import { fetchSourceVideo } from "./ingest";
import { rankClips } from "./ai";
import {
  renderSegments,
  toSegments,
  transcribeWords,
  type Segment,
  type Word,
} from "./stt";

type Checkpoints = {
  videoPath?: string;
  audioPath?: string;
  durationSeconds?: number;
  transcribed?: boolean;
  ranked?: boolean;
};

/**
 * Snap a segment-boundary time to the nearest natural speech boundary in the
 * word timings, and give the clip a little air at each end.
 *
 * The ranking model reasons about segments; viewers notice single frames. A cut
 * that lands mid-word, or exactly on the first phoneme, reads as broken — so
 * starts are pulled back into the preceding pause and ends pushed past the
 * final word.
 */
function refineBoundaries(
  words: Word[],
  startSeconds: number,
  endSeconds: number
): { start: number; end: number } {
  const firstIdx = words.findIndex((w) => w.start >= startSeconds - 0.01);
  const lastIdx = (() => {
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].end <= endSeconds + 0.01) return i;
    }
    return words.length - 1;
  })();

  const first = words[Math.max(0, firstIdx)];
  const last = words[Math.max(0, lastIdx)];
  if (!first || !last) return { start: startSeconds, end: endSeconds };

  // Start: take up to 250ms of the preceding silence so the first word isn't clipped.
  const prev = words[Math.max(0, firstIdx - 1)];
  const gapBefore = prev && firstIdx > 0 ? first.start - prev.end : 0.4;
  const start = Math.max(0, first.start - Math.min(0.25, Math.max(0.08, gapBefore * 0.6)));

  // End: let the final word finish, plus a short tail.
  const next = words[lastIdx + 1];
  const gapAfter = next ? next.start - last.end : 0.4;
  const end = last.end + Math.min(0.35, Math.max(0.12, gapAfter * 0.6));

  return { start, end };
}

/**
 * Mine clip candidates from a long source video.
 *
 * Nothing is rendered here — the expensive half is deliberately deferred until
 * a human has approved the picks, so a bad ranking costs pennies rather than a
 * pile of render time.
 */
export async function runHarvest(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { source: true },
  });
  const source = job.source;
  if (!source) throw new Error("harvest job has no source");
  if (!ANTHROPIC_API_KEY) throw new Error("clip ranking needs ANTHROPIC_API_KEY in .env");

  const cp = JSON.parse(job.checkpointsJson) as Checkpoints;
  const save = async (step: string) => {
    await prisma.job.update({
      where: { id: jobId },
      data: { step, checkpointsJson: JSON.stringify(cp), state: "RUNNING" },
    });
  };

  // ---- 1. Media ------------------------------------------------------------
  let videoPath = source.videoPath ?? cp.videoPath;
  if (!videoPath) {
    if (!source.sourceUrl) throw new Error("source has neither an upload nor a URL");
    await save("Downloading source video");
    const got = await fetchSourceVideo(source.sourceUrl, `src-${source.id}`, (pct) => {
      void save(`Downloading source video — ${pct}%`);
    });
    videoPath = got.relPath;
    cp.videoPath = videoPath;
    await prisma.source.update({
      where: { id: source.id },
      data: {
        videoPath,
        title: source.title || got.title || "Untitled source",
      },
    });
    await save("Source downloaded");
  }

  if (!cp.durationSeconds) {
    cp.durationSeconds = await probeDurationSeconds(videoPath);
    await prisma.source.update({
      where: { id: source.id },
      data: { durationSeconds: cp.durationSeconds },
    });
  }

  if (!cp.audioPath) {
    await save("Extracting audio");
    cp.audioPath = `sources/${source.id}-audio.mp3`;
    await extractAudio(videoPath, cp.audioPath);
    await prisma.source.update({
      where: { id: source.id },
      data: { audioPath: cp.audioPath },
    });
  }

  // ---- 2. Transcribe -------------------------------------------------------
  let words: Word[];
  if (cp.transcribed && source.transcriptJson) {
    words = JSON.parse(source.transcriptJson) as Word[];
  } else {
    const mins = Math.round((cp.durationSeconds ?? 0) / 60);
    await save(`Transcribing ${mins} minutes of audio`);
    words = await transcribeWords(cp.audioPath);
    if (!words.length) throw new Error("no speech found in this source");
    cp.transcribed = true;
    await prisma.source.update({
      where: { id: source.id },
      data: { transcriptJson: JSON.stringify(words) },
    });
    await save("Transcript ready");
  }

  // ---- 3. Segment ----------------------------------------------------------
  const segments: Segment[] = toSegments(words);
  await prisma.source.update({
    where: { id: source.id },
    data: { segmentsJson: JSON.stringify(segments) },
  });

  // ---- 4. Rank -------------------------------------------------------------
  await save(`Finding clips across ${segments.length} segments`);
  const candidates = await rankClips({
    segmentsText: renderSegments(segments),
    brief: source.brief ?? undefined,
    minSeconds: source.minClipSeconds,
    maxSeconds: source.maxClipSeconds,
    maxClips: 20,
  });

  // ---- 5. Persist, with exact cut points -----------------------------------
  await save("Saving clip candidates");
  await prisma.clip.deleteMany({ where: { sourceId: source.id } });

  let rank = 0;
  for (const c of candidates) {
    const from = segments[c.startSegment];
    const to = segments[Math.min(c.endSegment, segments.length - 1)];
    if (!from || !to || to.end <= from.start) continue;

    const { start, end } = refineBoundaries(words, from.start, to.end);
    const length = end - start;
    // The model is told the window but doesn't always respect it; drop the
    // stragglers rather than render something unusable.
    if (length < source.minClipSeconds * 0.6 || length > source.maxClipSeconds * 1.5) continue;

    await prisma.clip.create({
      data: {
        sourceId: source.id,
        startSeconds: start,
        endSeconds: end,
        score: Math.max(0, Math.min(100, Math.round(c.score ?? 0))),
        title: c.title?.slice(0, 120),
        reason: c.reason?.slice(0, 500),
        transcriptText: words
          .filter((w) => w.start >= start && w.end <= end)
          .map((w) => w.text)
          .join(" "),
        rank: rank++,
      },
    });
  }

  cp.ranked = true;
  await prisma.job.update({
    where: { id: jobId },
    data: {
      state: "DONE",
      step: `Found ${rank} clips`,
      checkpointsJson: JSON.stringify(cp),
    },
  });
}
