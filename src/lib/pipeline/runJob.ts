import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { prisma } from "../db";
import { PUBLIC_DIR, RENDERS_DIR } from "../env";
import { absPath, ensurePublicUrl } from "../storage";
import { generateVoiceover } from "./tts";
import { beatStartSeconds, transcribeWords } from "./stt";
import { klingImageToVideo, latentSync } from "./magnific";
import { muxAudio, palindromeLoop } from "./ffmpeg";
import { renderComposition } from "./render";

type BeatInput = Record<string, unknown> & {
  type: string;
  durationInFrames: number;
  narration?: string;
};

type Checkpoints = {
  ttsRelPath?: string;
  ttsDuration?: number;
  starts?: number[];
  klingRelPath?: string;
  loopRelPath?: string;
  lipsyncRelPath?: string;
  presenterRelPath?: string;
  renderedPath?: string;
};

/**
 * Execute one render job end-to-end. Progress and per-step outputs are
 * checkpointed to the DB so retries resume rather than re-bill earlier steps.
 */
export async function runJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { project: true },
  });
  const project = job.project;
  const beats = JSON.parse(project.beatsJson) as BeatInput[];
  const cp = JSON.parse(job.checkpointsJson) as Checkpoints;

  const save = async (step: string) => {
    await prisma.job.update({
      where: { id: jobId },
      data: { step, checkpointsJson: JSON.stringify(cp), state: "RUNNING" },
    });
  };

  const script = beats
    .map((b) => (b.narration ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const wantsVoice = !project.silent && script.length > 0;

  // ---- 1. Narration -------------------------------------------------------
  if (wantsVoice && !cp.ttsRelPath) {
    await save("Generating voiceover");
    if (!project.voiceId) throw new Error("project has no voice selected");
    const tts = await generateVoiceover({
      text: script,
      voiceId: project.voiceId,
      fileBase: `narration-${project.id}`,
    });
    cp.ttsRelPath = tts.relPath;
    cp.ttsDuration = tts.durationSeconds;
    await save("Voiceover ready");
  }

  const voiceover =
    wantsVoice && cp.ttsRelPath
      ? {
          src: path.basename(cp.ttsRelPath),
          volume: 1,
          durationInSeconds: cp.ttsDuration,
        }
      : undefined;

  // ---- 2. Style branches ---------------------------------------------------
  if (project.style === "PRESENTER") {
    if (!wantsVoice || !cp.ttsRelPath || !cp.ttsDuration) {
      throw new Error("presenter videos need narration text on the beats");
    }
    const photo = project.photoId
      ? await prisma.asset.findUnique({ where: { id: project.photoId } })
      : null;
    if (!photo) throw new Error("presenter videos need a presenter photo");
    if (!photo.consent) throw new Error("presenter photo is missing consent confirmation");

    if (!cp.starts) {
      await save("Aligning narration timestamps");
      const words = await transcribeWords(cp.ttsRelPath);
      cp.starts = beatStartSeconds(
        beats.map((b) => b.narration ?? ""),
        words
      );
      await save("Timestamps aligned");
    }

    if (!cp.klingRelPath) {
      await save("Animating photo (Kling — takes a few minutes)");
      cp.klingRelPath = await klingImageToVideo({
        photoRelPath: photo.path,
        outRelPath: `work/kling-${project.id}.mp4`,
      });
      await save("Base clip ready");
    }

    if (!cp.loopRelPath) {
      await save("Extending base clip");
      cp.loopRelPath = `work/loop-${project.id}.mp4`;
      await palindromeLoop(cp.klingRelPath, cp.loopRelPath, cp.ttsDuration + 0.1);
      await save("Base clip extended");
    }

    if (!cp.lipsyncRelPath) {
      await save("Lip-syncing (takes several minutes)");
      const videoUrl = await ensurePublicUrl(cp.loopRelPath);
      const audioUrl = await ensurePublicUrl(cp.ttsRelPath);
      cp.lipsyncRelPath = await latentSync({
        videoUrl,
        audioUrl,
        outRelPath: `work/lipsync-${project.id}.mp4`,
      });
      await save("Lip-sync done");
    }

    if (!cp.presenterRelPath) {
      await save("Restoring full-quality audio");
      cp.presenterRelPath = `public/presenter-${project.id}.mp4`;
      await muxAudio(cp.lipsyncRelPath, cp.ttsRelPath, cp.presenterRelPath);
      await save("Presenter clip ready");
    }

    if (!cp.renderedPath) {
      await save("Rendering final video");
      const segments = beats.map((b, i) => ({
        startSeconds: cp.starts![i],
        beat: b,
      }));
      cp.renderedPath = await renderComposition({
        compositionId: "PresenterVideo",
        props: {
          videoSrc: path.basename(cp.presenterRelPath),
          durationInSeconds: cp.ttsDuration,
          segments,
          accent: project.accent,
        },
        outName: `presenter-${project.id}-${job.id.slice(-6)}`,
      });
    }
  } else {
    // BRANDED (StoryVideo) or CARTOON (CartoonExplainer)
    if (!cp.renderedPath) {
      await save("Rendering video");
      cp.renderedPath = await renderComposition({
        compositionId: project.style === "CARTOON" ? "CartoonExplainer" : "StoryVideo",
        props: { beats, voiceover, transitionDurationInFrames: 16 },
        outName: `${project.style.toLowerCase()}-${project.id}-${job.id.slice(-6)}`,
      });
    }
  }

  // ---- 3. Publish ----------------------------------------------------------
  const outRel = `renders/${path.basename(cp.renderedPath)}`;
  await mkdir(RENDERS_DIR, { recursive: true });
  if (path.resolve(cp.renderedPath) !== path.resolve(absPath(outRel))) {
    await copyFile(cp.renderedPath, absPath(outRel));
  }
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

export async function markFailed(jobId: string, err: unknown): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { state: "FAILED", error: String(err instanceof Error ? err.message : err) },
  });
}
