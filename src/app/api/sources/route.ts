import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  title: z.string().default(""),
  sourceUrl: z.string().url().optional(),
  /** Storage-relative path when the video was uploaded instead of linked. */
  videoPath: z.string().optional(),
  brief: z.string().optional(),
  minClipSeconds: z.number().int().min(5).max(180).default(20),
  maxClipSeconds: z.number().int().min(10).max(300).default(60),
});

export async function GET() {
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { clips: true } },
    },
  });
  return NextResponse.json(sources);
}

/** Register a long-form source and queue the harvest. */
export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (!d.sourceUrl && !d.videoPath) {
    return NextResponse.json(
      { error: "Provide a video URL or upload a file." },
      { status: 400 }
    );
  }
  if (d.maxClipSeconds <= d.minClipSeconds) {
    return NextResponse.json(
      { error: "Maximum clip length must be greater than the minimum." },
      { status: 400 }
    );
  }

  const source = await prisma.source.create({
    data: {
      title: d.title || "Untitled source",
      sourceUrl: d.sourceUrl,
      videoPath: d.videoPath,
      brief: d.brief,
      minClipSeconds: d.minClipSeconds,
      maxClipSeconds: d.maxClipSeconds,
      jobs: { create: { kind: "HARVEST", step: "Queued" } },
    },
    include: { jobs: true },
  });
  return NextResponse.json(source, { status: 201 });
}
