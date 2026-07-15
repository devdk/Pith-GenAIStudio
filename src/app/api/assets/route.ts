import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";

/** Upload a presenter photo (multipart: file, consent=true). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const consent = form.get("consent") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json(
      { error: "You must confirm you have the person's consent to use their likeness." },
      { status: 400 }
    );
  }
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return NextResponse.json({ error: "unsupported image type" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "image must be under 10MB" }, { status: 400 });
  }
  const asset = await prisma.asset.create({
    data: { kind: "PHOTO", path: "", originalName: file.name, consent },
  });
  const rel = await saveFile(`assets/${asset.id}.${ext}`, buf);
  await prisma.asset.update({ where: { id: asset.id }, data: { path: rel } });
  return NextResponse.json({ id: asset.id, path: rel }, { status: 201 });
}
