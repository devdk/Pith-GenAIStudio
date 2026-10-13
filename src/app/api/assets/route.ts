import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp"];
const VIDEO_EXT = ["mp4", "mov", "webm", "m4v"];

/**
 * Upload an asset.
 *   kind=PHOTO (default) — presenter photo, requires consent=true
 *   kind=VIDEO           — background / b-roll footage for 9:16 reels
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "PHOTO").toUpperCase();
  const consent = form.get("consent") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (kind !== "PHOTO" && kind !== "VIDEO") {
    return NextResponse.json({ error: "kind must be PHOTO or VIDEO" }, { status: 400 });
  }
  // Likeness consent applies to presenter photos, not to b-roll footage.
  if (kind === "PHOTO" && !consent) {
    return NextResponse.json(
      { error: "You must confirm you have the person's consent to use their likeness." },
      { status: 400 }
    );
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const allowed = kind === "PHOTO" ? IMAGE_EXT : VIDEO_EXT;
  if (!allowed.includes(ext)) {
    return NextResponse.json(
      { error: `unsupported file type for ${kind} (allowed: ${allowed.join(", ")})` },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const limit = kind === "PHOTO" ? 10 : 200; // MB
  if (buf.length > limit * 1024 * 1024) {
    return NextResponse.json({ error: `file must be under ${limit}MB` }, { status: 400 });
  }

  const asset = await prisma.asset.create({
    data: { kind, path: "", originalName: file.name, consent },
  });
  const rel = await saveFile(`assets/${asset.id}.${ext}`, buf);
  await prisma.asset.update({ where: { id: asset.id }, data: { path: rel } });
  return NextResponse.json({ id: asset.id, path: rel, kind }, { status: 201 });
}
