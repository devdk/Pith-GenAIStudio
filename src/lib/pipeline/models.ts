/**
 * Background-video model registry.
 *
 * Every entry has been probed against the live API. Two quirks are encoded here
 * because they are undocumented and cost real time to discover:
 *   1. Status endpoints drop the tier suffix (POST `kling-v3-std` -> GET `kling-v3`).
 *   2. The aspect-ratio vocabulary differs per model family ("9:16" vs
 *      "social_story_9_16").
 */
export type BgModelId =
  | "kling-v3-std"
  | "kling-v3-pro"
  | "kling-v2-6-pro"
  | "seedance-2-fast-720p";

export type BgModel = {
  id: BgModelId;
  label: string;
  /** Path after /v1/ai/ for the POST. */
  postPath: string;
  /** Path after /v1/ai/ for the status GET (task id appended). */
  statusPath: string;
  minSeconds: number;
  maxSeconds: number;
  /** When set, only these exact durations are accepted. */
  allowedDurations?: number[];
  /** Value for the model's aspect_ratio field. */
  aspectRatio: string;
  /** True when the model renders 1080-wide natively (no upscaling needed). */
  native1080: boolean;
  /** Measured output size, or a note when it hasn't been verified yet. */
  resolutionNote: string;
  /** Supports multi_prompt: several shots, each with its own duration. */
  multiShot: boolean;
  /** Shown in the UI to explain the trade-off. */
  note: string;
};

export const BG_MODELS: Record<BgModelId, BgModel> = {
  "kling-v3-std": {
    id: "kling-v3-std",
    label: "Kling 3 Standard — up to 15s, multi-shot",
    postPath: "video/kling-v3-std",
    statusPath: "video/kling-v3",
    minSeconds: 3,
    maxSeconds: 15,
    aspectRatio: "9:16",
    // Measured: this model returns 720x1280, so it is upscaled to fill the frame.
    native1080: false,
    resolutionNote: "720×1280 (measured) — upscaled to 1080×1920",
    multiShot: true,
    note: "One call covers the whole reel: each beat becomes its own shot. Fewest generations, but 720p source.",
  },
  "kling-v3-pro": {
    id: "kling-v3-pro",
    label: "Kling 3 Pro — up to 15s, multi-shot, highest quality",
    postPath: "video/kling-v3-pro",
    statusPath: "video/kling-v3",
    minSeconds: 3,
    maxSeconds: 15,
    aspectRatio: "9:16",
    // Not yet measured; assume the same 720p source as Standard until verified.
    native1080: false,
    resolutionNote: "not yet verified (Standard returns 720×1280)",
    multiShot: true,
    note: "Same as Standard but the premium tier — best motion and detail.",
  },
  "kling-v2-6-pro": {
    id: "kling-v2-6-pro",
    label: "Kling 2.6 Pro — 5 or 10s, one scene per clip",
    postPath: "image-to-video/kling-v2-6-pro",
    statusPath: "image-to-video/kling-v2-6",
    minSeconds: 5,
    maxSeconds: 10,
    allowedDurations: [5, 10],
    aspectRatio: "social_story_9_16",
    native1080: true,
    resolutionNote: "1080×1920 (measured) — no upscaling",
    multiShot: false,
    note: "Sharpest source. One generation per beat, so the most calls per reel.",
  },
  "seedance-2-fast-720p": {
    id: "seedance-2-fast-720p",
    label: "Seedance 2 Fast (720p) — cheap draft mode",
    postPath: "video/seedance-2-fast-720p",
    statusPath: "video/seedance-2-fast",
    minSeconds: 5,
    maxSeconds: 10,
    allowedDurations: [5, 10],
    aspectRatio: "social_story_9_16",
    native1080: false,
    resolutionNote: "720p — upscaled to 1080×1920",
    multiShot: false,
    note: "Cheapest tier for iterating before a final pass on a better model.",
  },
};

export const DEFAULT_BG_MODEL: BgModelId = "kling-v3-std";

export function getBgModel(id: string | null | undefined): BgModel {
  return BG_MODELS[(id as BgModelId) ?? DEFAULT_BG_MODEL] ?? BG_MODELS[DEFAULT_BG_MODEL];
}

/** Snap a requested duration to something the model will accept. */
export function clampDuration(model: BgModel, seconds: number): number {
  if (model.allowedDurations) {
    // Pick the shortest allowed duration that still covers the span.
    const fit = model.allowedDurations.find((d) => d >= seconds - 0.01);
    return fit ?? model.allowedDurations[model.allowedDurations.length - 1];
  }
  return Math.min(model.maxSeconds, Math.max(model.minSeconds, Math.ceil(seconds)));
}

/**
 * Group consecutive beats into generation segments no longer than the model
 * allows, so a 15s reel is covered by one or two clips instead of one per beat.
 *
 * Only multi-shot models group: they cut between shots *inside* one generation,
 * so each beat keeps its own visuals. A single-scene model gets one generation
 * per beat — grouping there would stretch one continuous scene across several
 * different messages, which is the look we are specifically avoiding.
 *
 * `spans` are [start, end] seconds per beat. Returns, per segment, the beat
 * indices it covers and its start/end time.
 */
export function planSegments(
  model: BgModel,
  spans: Array<[number, number]>
): Array<{ beatIndices: number[]; start: number; end: number }> {
  if (!model.multiShot) {
    return spans.map(([start, end], i) => ({ beatIndices: [i], start, end }));
  }

  const segments: Array<{ beatIndices: number[]; start: number; end: number }> = [];
  let current: { beatIndices: number[]; start: number; end: number } | null = null;

  for (let i = 0; i < spans.length; i++) {
    const [s, e] = spans[i];
    if (current && e - current.start <= model.maxSeconds) {
      current.beatIndices.push(i);
      current.end = e;
      continue;
    }
    if (current) segments.push(current);
    current = { beatIndices: [i], start: s, end: e };
  }
  if (current) segments.push(current);
  return segments;
}
