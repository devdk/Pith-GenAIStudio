import { readFile, writeFile } from "node:fs/promises";
import { MAGNIFIC_API_KEY, requireEnv } from "../env";
import { absPath } from "../storage";

const BASE = "https://api.magnific.com/v1/ai";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TaskData = { task_id?: string; status?: string; generated?: string[] };

async function req(method: string, url: string, body?: unknown): Promise<{ data?: TaskData }> {
  const key = requireEnv("MAGNIFIC_API_KEY", MAGNIFIC_API_KEY);
  const res = await fetch(url, {
    method,
    headers: {
      "x-magnific-api-key": key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Magnific ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function pollAndDownload(opts: {
  statusUrl: string;
  outRelPath: string;
  timeoutMs: number;
  onStatus?: (s: string) => void;
}): Promise<string> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    await sleep(10_000);
    const data = (await req("GET", opts.statusUrl)).data ?? {};
    opts.onStatus?.(data.status ?? "?");
    if (data.status === "COMPLETED") {
      const url = (data.generated ?? [])[0];
      if (!url) throw new Error("task completed but returned no output URL");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      await writeFile(absPath(opts.outRelPath), Buffer.from(await res.arrayBuffer()));
      return opts.outRelPath;
    }
    if (data.status === "FAILED") throw new Error("Magnific task FAILED");
    if (Date.now() > deadline) throw new Error("Magnific task timed out");
  }
}

/** Animate a still photo into a short talking-to-camera clip (Kling v2.1 std). */
export async function klingImageToVideo(opts: {
  photoRelPath: string;
  outRelPath: string;
  onStatus?: (s: string) => void;
}): Promise<string> {
  const image = (await readFile(absPath(opts.photoRelPath))).toString("base64");
  const submit = await req("POST", `${BASE}/image-to-video/kling-v2-1-std`, {
    image,
    prompt:
      "The person speaks directly to the camera like a presenter explaining something. Natural subtle head movements, calm confident talking, occasional slight nod. Static camera, realistic, background stays still.",
    negative_prompt:
      "camera movement, zoom, distortion, morphing, extra hands, text, warping face",
    duration: "10",
    cfg_scale: 0.5,
  });
  const taskId = submit.data?.task_id;
  if (!taskId) throw new Error("Kling did not return a task_id");
  return pollAndDownload({
    // Status endpoint drops the -std suffix (API quirk).
    statusUrl: `${BASE}/image-to-video/kling-v2-1/${taskId}`,
    outRelPath: opts.outRelPath,
    timeoutMs: 15 * 60 * 1000,
    onStatus: opts.onStatus,
  });
}

/** Lip-sync a base video to narration audio (Latent Sync). URLs must be redirect-free. */
export async function latentSync(opts: {
  videoUrl: string;
  audioUrl: string;
  outRelPath: string;
  onStatus?: (s: string) => void;
}): Promise<string> {
  const submit = await req("POST", `${BASE}/lip-sync/latent-sync`, {
    video_url: opts.videoUrl,
    audio_url: opts.audioUrl,
  });
  const taskId = submit.data?.task_id;
  if (!taskId) throw new Error("Latent Sync did not return a task_id");
  return pollAndDownload({
    statusUrl: `${BASE}/lip-sync/latent-sync/${taskId}`,
    outRelPath: opts.outRelPath,
    timeoutMs: 25 * 60 * 1000,
    onStatus: opts.onStatus,
  });
}
