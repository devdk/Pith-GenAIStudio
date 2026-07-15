import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const beatSchema = z
  .object({
    type: z.enum(["hook", "problem", "stat", "insight", "solution", "cta", "logo"]),
    durationInFrames: z.number().int().min(1).default(90),
    narration: z.string().optional(),
  })
  .passthrough();

const createSchema = z.object({
  name: z.string().min(1),
  style: z.enum(["BRANDED", "CARTOON", "PRESENTER"]),
  beats: z.array(beatSchema).min(1),
  voiceId: z.string().optional(),
  silent: z.boolean().default(false),
  accent: z.string().default("#8c52ff"),
  photoId: z.string().optional(),
});

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (d.style === "PRESENTER" && !d.photoId) {
    return NextResponse.json(
      { error: "Presenter videos need a presenter photo." },
      { status: 400 }
    );
  }
  const hasNarration = d.beats.some((b) => (b.narration ?? "").trim());
  if (!d.silent && !hasNarration) {
    return NextResponse.json(
      { error: "Add narration text to at least one beat, or mark the video silent." },
      { status: 400 }
    );
  }
  if (!d.silent && hasNarration && !d.voiceId) {
    return NextResponse.json({ error: "Pick a voice for the narration." }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      name: d.name,
      style: d.style,
      beatsJson: JSON.stringify(d.beats),
      voiceId: d.voiceId,
      silent: d.silent,
      accent: d.accent,
      photoId: d.photoId,
      jobs: { create: {} },
    },
    include: { jobs: true },
  });
  return NextResponse.json(project, { status: 201 });
}
