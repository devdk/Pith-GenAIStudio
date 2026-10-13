import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  title: z.string().max(120).optional(),
  startSeconds: z.number().min(0).optional(),
  endSeconds: z.number().min(0).optional(),
});

/** Approve, reject, retitle or nudge the boundaries of a candidate clip. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (
    d.startSeconds !== undefined &&
    d.endSeconds !== undefined &&
    d.endSeconds <= d.startSeconds
  ) {
    return NextResponse.json({ error: "End must be after start." }, { status: 400 });
  }

  const clip = await prisma.clip.update({ where: { id }, data: d });
  return NextResponse.json(clip);
}
