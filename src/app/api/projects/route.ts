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

/** 9:16 reel formats — all need narration, two of them need a presenter photo. */
const VERTICAL = ["COMMENTARY", "BROLL", "SPLIT"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  style: z.enum(["BRANDED", "CARTOON", "PRESENTER", ...VERTICAL]),
  beats: z.array(beatSchema).min(1),
  voiceId: z.string().optional(),
  silent: z.boolean().default(false),
  accent: z.string().default("#8c52ff"),
  photoId: z.string().optional(),
  backgroundId: z.string().optional(),
  captionStyle: z.enum(["bold", "karaoke", "boxed"]).default("bold"),
  bgModel: z
    .enum(["kling-v3-std", "kling-v3-pro", "kling-v2-6-pro", "seedance-2-fast-720p"])
    .default("kling-v3-std"),
  headline: z.string().optional(),
  brand: z.string().optional(),
  sourceUrl: z.string().optional(),
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

  const needsFace = d.style === "PRESENTER" || d.style === "COMMENTARY" || d.style === "SPLIT";
  if (needsFace && !d.photoId) {
    return NextResponse.json(
      { error: "This format needs a presenter photo." },
      { status: 400 }
    );
  }
  const isVertical = (VERTICAL as readonly string[]).includes(d.style);
  if (isVertical && d.silent) {
    return NextResponse.json(
      { error: "Reel formats are caption-driven and need narration — uncheck silent." },
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
      backgroundId: d.backgroundId,
      captionStyle: d.captionStyle,
      bgModel: d.bgModel,
      headline: d.headline,
      brand: d.brand,
      sourceUrl: d.sourceUrl,
      jobs: { create: {} },
    },
    include: { jobs: true },
  });
  return NextResponse.json(project, { status: 201 });
}
