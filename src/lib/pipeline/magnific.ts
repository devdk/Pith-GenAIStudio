import { readFile, writeFile } from "node:fs/promises";
import { MAGNIFIC_API_KEY, requireEnv } from "../env";
import { absPath, ensureAbsPath } from "../storage";
import { clampDuration, type BgModel } from "./models";

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
      const dest = await ensureAbsPath(opts.outRelPath);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
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

const NEGATIVE_PROMPT =
  "text, captions, subtitles, watermark, logo, letters, words, talking head, " +
  "person speaking to camera, distorted faces, extra limbs";

/** One shot within a multi-shot generation. */
export type Shot = { prompt: string; seconds: number };

/**
 * Generate a background clip from text, using any model in the registry.
 *
 * Multi-shot models (Kling 3) take an array of shots and cut between them
 * inside a single generation, so one call can cover a whole reel with a
 * distinct scene per beat. Single-scene models take one prompt.
 *
 * Audio is always disabled — these clips sit under separately generated
 * narration, and Kling 3 would otherwise generate audio by default.
 */
export async function generateBackgroundClip(opts: {
  model: BgModel;
  shots: Shot[];
  outRelPath: string;
  onStatus?: (s: string) => void;
}): Promise<string> {
  const { model, shots } = opts;
  if (shots.length === 0) throw new Error("generateBackgroundClip: no shots");

  const totalSeconds = clampDuration(
    model,
    shots.reduce((s, sh) => s + sh.seconds, 0)
  );

  const body: Record<string, unknown> = {
    duration: String(totalSeconds),
    aspect_ratio: model.aspectRatio,
    negative_prompt: NEGATIVE_PROMPT,
    cfg_scale: 0.5,
    generate_audio: false,
  };

  if (model.multiShot && shots.length > 1) {
    // Per-shot durations must add up to the requested total.
    const ints = apportionSeconds(shots.map((s) => s.seconds), totalSeconds, model.minSeconds);
    body.multi_shot = true;
    body.shot_type = "customize";
    body.multi_prompt = shots.map((s, i) => ({
      prompt: s.prompt.slice(0, 2500),
      duration: String(ints[i]),
    }));
    // A top-level prompt is still required by some models as a fallback.
    body.prompt = shots[0].prompt.slice(0, 2500);
  } else {
    body.prompt = shots.map((s) => s.prompt).join(" Then: ").slice(0, 2500);
  }

  const submit = await req("POST", `${BASE}/${model.postPath}`, body);
  const taskId = submit.data?.task_id;
  if (!taskId) throw new Error(`${model.id} did not return a task_id`);
  return pollAndDownload({
    statusUrl: `${BASE}/${model.statusPath}/${taskId}`,
    outRelPath: opts.outRelPath,
    timeoutMs: 20 * 60 * 1000,
    onStatus: opts.onStatus,
  });
}

/**
 * Split `total` whole seconds across shots in proportion to their requested
 * lengths, giving every shot at least `min` and losing no seconds to rounding.
 */
function apportionSeconds(requested: number[], total: number, min: number): number[] {
  const floorMin = Math.max(1, Math.min(min, Math.floor(total / requested.length)));
  const sum = requested.reduce((a, b) => a + b, 0) || 1;
  const raw = requested.map((r) => Math.max(floorMin, Math.floor((r / sum) * total)));
  let diff = total - raw.reduce((a, b) => a + b, 0);
  // Hand out (or claw back) the rounding remainder, largest shots first.
  const order = requested
    .map((r, i) => ({ i, r }))
    .sort((a, b) => b.r - a.r)
    .map(({ i }) => i);
  let k = 0;
  while (diff > 0) {
    raw[order[k % order.length]] += 1;
    diff--;
    k++;
  }
  k = 0;
  while (diff < 0) {
    const idx = order[k % order.length];
    if (raw[idx] > floorMin) {
      raw[idx] -= 1;
      diff++;
    }
    k++;
    if (k > order.length * 100) break;
  }
  return raw;
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
