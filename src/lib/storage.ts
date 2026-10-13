import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "./env";

/**
 * Local-filesystem storage. On the VPS this module is the seam to swap for
 * S3/R2: keep the same relative-path keys, change the implementations.
 */
export async function saveFile(relPath: string, data: Buffer): Promise<string> {
  const abs = path.join(STORAGE_DIR, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return relPath;
}

export function absPath(relPath: string): string {
  return path.join(STORAGE_DIR, relPath);
}

/** Ensure the parent directory of a storage-relative path exists, return its abs path. */
export async function ensureAbsPath(relPath: string): Promise<string> {
  const abs = path.join(STORAGE_DIR, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  return abs;
}

/**
 * The lip-sync API downloads inputs from public, redirect-free URLs. Local
 * files aren't reachable from the internet, so in local dev we upload to
 * uguu.se (direct-serving, ~3h retention). On the VPS, replace with presigned
 * R2/S3 URLs.
 */
export async function ensurePublicUrl(relPath: string): Promise<string> {
  const data = await readFile(absPath(relPath));
  const form = new FormData();
  const name = path.basename(relPath).replace(/[^A-Za-z0-9._-]/g, "_");
  form.append("files[]", new Blob([new Uint8Array(data)]), name);
  const res = await fetch("https://uguu.se/upload?output=text", {
    method: "POST",
    body: form,
  });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith("https://")) {
    throw new Error(`public upload failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return text;
}
