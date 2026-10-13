import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import { prisma } from "../db";
import { PUBLIC_DIR, RENDERS_DIR } from "../env";
import { absPath, ensurePublicUrl } from "../storage";
import { generateVoiceover } from "./tts";
import { alignNarration, beatStartSeconds, transcribeWords, type Word } from "./stt";
import { klingImageToVideo, latentSync } from "./magnific";
import {
  extractCoverFrame,
  muxAudio,
  palindromeLoop,
  prepareVerticalBackground,
} from "./ffmpeg";
import { renderComposition } from "./render";
import { generatePostCaption, visualPromptsForBeats } from "./ai";
import { buildBeatBackgrounds } from "./background";
import { getBgModel } from "./models";
import { ANTHROPIC_API_KEY } from "../env";

/** 9:16 reel formats, which share the VerticalVideo composition. */
const VERTICAL_STYLES: Record<string, "commentary" | "broll" | "split"> = {
  COMMENTARY: "commentary",
  BROLL: "broll",
  SPLIT: "split",
};

type BeatInput = Record<string, unknown> & {
  type: string;
  durationInFrames: number;
  narration?: string;
};

type Checkpoints = {
  ttsRelPath?: string;
  ttsDuration?: number;
  starts?: number[];
  words?: Word[];
  klingRelPath?: string;
  loopRelPath?: string;
  lipsyncRelPath?: string;
  presenterRelPath?: string;
  bgRelPath?: string;
  visualPrompts?: string[];
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
  // Jobs are polymorphic (RENDER vs HARVEST), so the relation is nullable.
  const project = job.project;
  if (!project) throw new Error("render job has no project");
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

  /**
   * Build the lip-synced presenter clip from the project photo: animate the
   * still (Kling), extend it to the narration length, lip-sync it, then restore
   * full-quality audio. Shared by the square PRESENTER style and the 9:16
   * commentary/split layouts.
   */
  const buildPresenterClip = async (): Promise<string> => {
    if (!cp.ttsRelPath || !cp.ttsDuration) {
      throw new Error("presenter videos need narration text on the beats");
    }
    const photo = project.photoId
      ? await prisma.asset.findUnique({ where: { id: project.photoId } })
      : null;
    if (!photo) throw new Error("presenter videos need a presenter photo");
    if (!photo.consent) throw new Error("presenter photo is missing consent confirmation");

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
    return cp.presenterRelPath;
  };

  /** Word timestamps for captions / beat alignment (cached in checkpoints). */
  const ensureWords = async (): Promise<Word[]> => {
    if (cp.words) return cp.words;
    await save("Aligning narration timestamps");
    cp.words = await transcribeWords(cp.ttsRelPath!);
    await save("Timestamps aligned");
    return cp.words;
  };

  const verticalLayout = VERTICAL_STYLES[project.style];

  // ---- 2. Style branches ---------------------------------------------------
  if (verticalLayout) {
    // 9:16 reel: commentary / broll / split
    if (!wantsVoice || !cp.ttsRelPath || !cp.ttsDuration) {
      throw new Error("reel formats need narration text on the beats");
    }
    const words = await ensureWords();
    // Captions show the authored wording (correct brand spelling), timed by the
    // transcript; beat boundaries come from the same alignment.
    const { captionWords, beatStarts } = alignNarration(
      beats.map((b) => b.narration ?? ""),
      words
    );

    // ---- Background: one AI-generated scene per beat -----------------------
    // Visuals cut when the topic cuts, driven by the narration timestamps.
    const uploaded = project.backgroundId
      ? await prisma.asset.findUnique({ where: { id: project.backgroundId } })
      : null;

    if (uploaded && !cp.bgRelPath) {
      // Explicit override: the user supplied their own footage.
      await save("Preparing uploaded background");
      cp.bgRelPath = `public/bg-${project.id}.mp4`;
      await prepareVerticalBackground(uploaded.path, cp.bgRelPath, cp.ttsDuration + 0.2);
      await save("Background ready");
    } else if (!uploaded && !cp.bgRelPath) {
      if (!ANTHROPIC_API_KEY) {
        throw new Error(
          "AI backgrounds need ANTHROPIC_API_KEY in .env (or upload your own footage)"
        );
      }
      // Prompts live on the beats so a refinement keeps unchanged scenes.
      // Beats carrying an authored prompt reuse it verbatim — that's what makes
      // the clip cache hit and avoids re-paying for unchanged scenes. Only new
      // or edited beats take the freshly written prompt.
      if (!cp.visualPrompts) {
        const authored = beats.map((b) => (b.visualPrompt as string | undefined)?.trim());
        if (authored.every(Boolean)) {
          cp.visualPrompts = authored as string[];
        } else {
          await save("Art-directing background scenes");
          const fresh = await visualPromptsForBeats(beats);
          cp.visualPrompts = fresh.map((p, i) => authored[i] || p);
        }
      }

      const spans = beatStarts.map(
        (s, i): [number, number] => [
          s,
          i + 1 < beatStarts.length ? beatStarts[i + 1] : cp.ttsDuration!,
        ]
      );

      cp.bgRelPath = `public/bg-${project.id}.mp4`;
      await buildBeatBackgrounds({
        model: getBgModel(project.bgModel),
        prompts: cp.visualPrompts,
        beatSpans: spans,
        outRelPath: cp.bgRelPath,
        projectId: project.id,
        onStep: save,
      });
      await save("Backgrounds ready");
    }

    const needsPresenter = verticalLayout !== "broll";
    const presenterRel = needsPresenter ? await buildPresenterClip() : undefined;

    if (!cp.renderedPath) {
      await save("Rendering reel");
      cp.renderedPath = await renderComposition({
        compositionId: "VerticalVideo",
        props: {
          layout: verticalLayout,
          backgroundSrc: cp.bgRelPath ? path.basename(cp.bgRelPath) : undefined,
          presenterSrc: presenterRel ? path.basename(presenterRel) : undefined,
          audioSrc: path.basename(cp.ttsRelPath),
          durationInSeconds: cp.ttsDuration,
          words: captionWords,
          captionStyle: project.captionStyle,
          accent: project.accent,
          headline: project.headline ?? undefined,
          brand: project.brand ?? undefined,
        },
        outName: `${project.style.toLowerCase()}-${project.id}-${job.id.slice(-6)}`,
      });
    }
  } else if (project.style === "PRESENTER") {
    if (!wantsVoice || !cp.ttsRelPath || !cp.ttsDuration) {
      throw new Error("presenter videos need narration text on the beats");
    }
    if (!cp.starts) {
      const words = await ensureWords();
      cp.starts = beatStartSeconds(
        beats.map((b) => b.narration ?? ""),
        words
      );
    }
    const presenterRel = await buildPresenterClip();

    if (!cp.renderedPath) {
      await save("Rendering final video");
      const segments = beats.map((b, i) => ({
        startSeconds: cp.starts![i],
        beat: b,
      }));
      cp.renderedPath = await renderComposition({
        compositionId: "PresenterVideo",
        props: {
          videoSrc: path.basename(presenterRel),
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
  // ---- 4. Ready-to-post extras --------------------------------------------
  // Best-effort: a failure here must not fail an otherwise finished video.
  let coverPath: string | undefined;
  let postCaption: string | undefined;
  let hashtagsJson: string | undefined;

  try {
    await save("Generating cover frame");
    const cover = `renders/${path.basename(outRel, ".mp4")}-cover.jpg`;
    await extractCoverFrame(outRel, cover, 1);
    coverPath = cover;
  } catch (err) {
    console.warn(`[job ${jobId}] cover frame failed:`, err);
  }

  if (ANTHROPIC_API_KEY && script) {
    try {
      await save("Writing post caption");
      const cap = await generatePostCaption({ script });
      postCaption = cap.caption;
      hashtagsJson = JSON.stringify(cap.hashtags);
    } catch (err) {
      console.warn(`[job ${jobId}] caption generation failed:`, err);
    }
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      state: "DONE",
      step: "Done",
      outputPath: outRel,
      checkpointsJson: JSON.stringify(cp),
      coverPath,
      postCaption,
      hashtagsJson,
    },
  });
}

export async function markFailed(jobId: string, err: unknown): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { state: "FAILED", error: String(err instanceof Error ? err.message : err) },
  });
}
