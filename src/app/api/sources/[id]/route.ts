import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const source = await prisma.source.findUnique({
    where: { id },
    include: {
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      clips: {
        orderBy: [{ status: "asc" }, { score: "desc" }],
        include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The transcript is large and only needed server-side — omit it from the payload.
  const { transcriptJson: _t, segmentsJson: _s, ...rest } = source;
  return NextResponse.json(rest);
}

/** Re-queue a failed or finished harvest (re-ranks with the current brief). */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const source = await prisma.source.findUnique({
    where: { id },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const last = source.jobs[0];
  if (last && (last.state === "QUEUED" || last.state === "RUNNING")) {
    return NextResponse.json({ error: "A harvest is already running." }, { status: 409 });
  }

  // Carry the download/transcript forward — only the ranking re-runs.
  const carried = last ? JSON.parse(last.checkpointsJson) : {};
  delete carried.ranked;

  const job = await prisma.job.create({
    data: {
      kind: "HARVEST",
      sourceId: id,
      step: "Queued (re-rank)",
      checkpointsJson: JSON.stringify(carried),
    },
  });
  return NextResponse.json({ jobId: job.id });
}
