import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { jobs: { orderBy: { createdAt: "desc" } }, photo: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(project);
}

/** Re-queue the latest failed job (resumes from its checkpoints). */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const failed = await prisma.job.findFirst({
    where: { projectId: id, state: "FAILED" },
    orderBy: { createdAt: "desc" },
  });
  if (!failed) return NextResponse.json({ error: "no failed job" }, { status: 400 });
  await prisma.job.update({
    where: { id: failed.id },
    data: { state: "QUEUED", step: "Re-queued", error: null },
  });
  return NextResponse.json({ ok: true });
}
