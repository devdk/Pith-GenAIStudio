import path from "node:path";
import { copyFile } from "node:fs/promises";
import { prisma } from "../db";
import { ANTHROPIC_API_KEY } from "../env";
import { absPath } from "../storage";
import { cutRange, extractCoverFrame } from "./ffmpeg";
import { packageClip } from "./ai";
import { renderComposition } from "./render";
import type { Word } from "./stt";

type Checkpoints = {
  cutRelPath?: string;
  hookText?: string;
  caption?: string;
  hashtags?: string[];
  renderedPath?: string;
};

/**
 * Keep only the words inside the clip and rebase them to a zero start, so the
 * captions line up with the cut file rather than the original timeline.
 */
function sliceWords(words: Word[], start: number, end: number): Word[] {
  return words
    .filter((w) => w.end > start && w.start < end)
    .map((w) => ({
      text: w.text,
      start: Math.max(0, w.start - start),
      end: Math.max(0.05, w.end - start),
    }));
}

/** Turn one approved clip into a finished, ready-to-post reel. */
export async function runClipRender(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { clip: { include: { source: true } } },
  });
  const clip = job.clip;
  if (!clip) throw new Error("clip job has no clip");
  const source = clip.source;
  if (!source?.videoPath) throw new Error("source video is no longer available");
  if (!source.transcriptJson) throw new Error("source has no transcript");

  const cp = JSON.parse(job.checkpointsJson) as Checkpoints;
  const save = async (step: string) => {
    await prisma.job.update({
      where: { id: jobId },
      data: { step, checkpointsJson: JSON.stringify(cp), state: "RUNNING" },
    });
  };

  const duration = clip.endSeconds - clip.startSeconds;

  // ---- 1. Cut the exact range ---------------------------------------------
  if (!cp.cutRelPath) {
    await save("Cutting clip");
    cp.cutRelPath = `public/clip-${clip.id}.mp4`;
    await cutRange(source.videoPath, cp.cutRelPath, clip.startSeconds, clip.endSeconds);
    await save("Clip cut");
  }

  // ---- 2. Hook + caption ---------------------------------------------------
  if (!cp.hookText && ANTHROPIC_API_KEY) {
    await save("Writing hook and caption");
    try {
      const pkg = await packageClip({
        transcript: clip.transcriptText ?? "",
        suggestedTitle: clip.title ?? undefined,
      });
      cp.hookText = pkg.hookText;
      cp.caption = pkg.caption;
      cp.hashtags = pkg.hashtags;
    } catch (err) {
      // Packaging is a nice-to-have; a missing hook must not lose the render.
      console.warn(`[clip ${clip.id}] packaging failed:`, err);
    }
  }

  // ---- 3. Render -----------------------------------------------------------
  if (!cp.renderedPath) {
    await save("Rendering reel");
    const words = JSON.parse(source.transcriptJson) as Word[];
    cp.renderedPath = await renderComposition({
      compositionId: "ClipReel",
      props: {
        videoSrc: path.basename(cp.cutRelPath),
        durationInSeconds: duration,
        words: sliceWords(words, clip.startSeconds, clip.endSeconds),
        hookText: cp.hookText ?? clip.title ?? undefined,
        layout: clip.layout === "fill" ? "fill" : "card",
        accent: "#8c52ff",
      },
      outName: `clip-${clip.id}-${job.id.slice(-6)}`,
    });
  }

  // ---- 4. Publish ----------------------------------------------------------
  const outRel = `renders/${path.basename(cp.renderedPath)}`;
  if (path.resolve(cp.renderedPath) !== path.resolve(absPath(outRel))) {
    await copyFile(cp.renderedPath, absPath(outRel));
  }

  let coverPath: string | undefined;
  try {
    // Pull the cover from after the hook card clears, so the thumbnail shows
    // the speaker rather than the overlay.
    const cover = `renders/${path.basename(outRel, ".mp4")}-cover.jpg`;
    await extractCoverFrame(outRel, cover, Math.min(2, duration * 0.5));
    coverPath = cover;
  } catch (err) {
    console.warn(`[clip ${clip.id}] cover frame failed:`, err);
  }

  await prisma.clip.update({
    where: { id: clip.id },
    data: {
      outputPath: outRel,
      coverPath,
      hookText: cp.hookText,
      postCaption: cp.caption,
      hashtagsJson: cp.hashtags ? JSON.stringify(cp.hashtags) : undefined,
    },
  });
  await prisma.job.update({
    where: { id: jobId },
    data: {
      state: "DONE",
      step: "Done",
      outputPath: outRel,
      checkpointsJson: JSON.stringify(cp),
    },
  });
}
