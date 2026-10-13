import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Queue a reel render for one approved clip. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { layout?: "card" | "fill" };

  const clip = await prisma.clip.findUnique({
    where: { id },
    include: {
      source: true,
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!clip) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!clip.source?.videoPath) {
    return NextResponse.json(
      { error: "The source video is no longer on disk — re-harvest it first." },
      { status: 409 }
    );
  }

  const last = clip.jobs[0];
  if (last && (last.state === "QUEUED" || last.state === "RUNNING")) {
    return NextResponse.json(
      { error: "This clip is already rendering." },
      { status: 409 }
    );
  }

  if (body.layout && body.layout !== clip.layout) {
    await prisma.clip.update({ where: { id }, data: { layout: body.layout } });
  }

  const job = await prisma.job.create({
    data: { kind: "CLIP", clipId: id, step: "Queued" },
  });
  return NextResponse.json({ jobId: job.id });
}
