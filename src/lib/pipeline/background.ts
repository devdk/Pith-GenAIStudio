import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { absPath } from "../storage";
import { generateBackgroundClip, type Shot } from "./magnific";
import { concatVideos, fitClipToDuration } from "./ffmpeg";
import { planSegments, type BgModel } from "./models";

/** Magnific allows a small number of concurrent generations per account. */
const MAX_CONCURRENT = 3;

const cacheKey = (model: BgModel, shots: Shot[]): string =>
  createHash("sha1")
    .update(
      model.id +
        "|" +
        shots.map((s) => `${s.prompt.trim()}@${Math.round(s.seconds)}`).join("||")
    )
    .digest("hex")
    .slice(0, 16);

/**
 * Build a background track whose visuals follow the beats.
 *
 * Beats are packed into as few generations as the model allows: a multi-shot
 * model (Kling 3, 15s) can cover a whole reel in one call while still cutting
 * per beat, whereas a single-scene model needs one generation per beat. Each
 * finished segment is trimmed to its exact on-screen span, then concatenated.
 *
 * Segments are cached on disk by (model + prompts + durations), so refinements
 * only pay for segments that actually changed.
 */
export async function buildBeatBackgrounds(opts: {
  model: BgModel;
  prompts: string[];
  beatSpans: Array<[number, number]>;
  outRelPath: string;
  projectId: string;
  onStep: (msg: string) => Promise<void> | void;
}): Promise<string> {
  const { model, prompts, beatSpans, outRelPath, projectId, onStep } = opts;
  if (prompts.length !== beatSpans.length) {
    throw new Error("background prompts and beat spans are misaligned");
  }

  const segments = planSegments(model, beatSpans);
  const plural = segments.length === 1 ? "" : "s";
  await onStep(
    `Generating background: ${segments.length} generation${plural} for ${prompts.length} beats (${model.label.split(" —")[0]})`
  );

  // ---- generate (or reuse) one clip per segment, capped concurrency ---------
  const clips: string[] = new Array(segments.length);
  let done = 0;
  let reused = 0;
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const s = next++;
      if (s >= segments.length) return;
      const seg = segments[s];
      const shots: Shot[] = seg.beatIndices.map((bi) => ({
        prompt: prompts[bi],
        seconds: Math.max(1, beatSpans[bi][1] - beatSpans[bi][0]),
      }));

      const rel = `work/bg-clips/${cacheKey(model, shots)}.mp4`;
      if (existsSync(absPath(rel))) {
        clips[s] = rel;
        reused++;
      } else {
        await generateBackgroundClip({ model, shots, outRelPath: rel });
        clips[s] = rel;
      }
      done++;
      await onStep(
        `Generating background — ${done}/${segments.length} done` +
          (reused ? ` (${reused} reused)` : "")
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, segments.length) }, worker)
  );

  // ---- trim each segment to its exact span, then join ----------------------
  await onStep("Cutting background to the beats");
  const fitted: string[] = [];
  for (let s = 0; s < segments.length; s++) {
    const seconds = Math.max(0.4, segments[s].end - segments[s].start);
    const rel = `work/bg-fit-${projectId}-${s}.mp4`;
    await fitClipToDuration(clips[s], rel, seconds);
    fitted.push(rel);
  }

  if (fitted.length === 1) {
    // Single segment: it is already the whole track, just normalised.
    await onStep("Background ready");
    await fitClipToDuration(fitted[0], outRelPath, segments[0].end - segments[0].start);
    return outRelPath;
  }

  await onStep("Assembling background track");
  await concatVideos(fitted, outRelPath);
  return outRelPath;
}
