import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { STORAGE_DIR } from "@/lib/env";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Serve storage files with Range support so <video> can seek. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  const abs = path.resolve(STORAGE_DIR, rel);
  if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let info;
  try {
    info = await stat(abs);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const type = TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream";

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? parseInt(m[2], 10) : info.size - 1;
    const stream = Readable.toWeb(
      createReadStream(abs, { start, end })
    ) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(info.size),
      "Accept-Ranges": "bytes",
    },
  });
}
