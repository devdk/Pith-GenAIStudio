import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { ANTHROPIC_API_KEY } from "@/lib/env";
import { absPath } from "@/lib/storage";
import {
  fetchPostAudio,
  fetchPostMetadata,
  isSupportedSocialUrl,
} from "@/lib/pipeline/ingest";
import { transcribeWords } from "@/lib/pipeline/stt";
import { remixRecipe } from "@/lib/pipeline/ai";

export const maxDuration = 300;

/**
 * Analyse a public social post and return an ORIGINAL script in the same style.
 *
 * The source's audio is fetched only to transcribe it for structural analysis;
 * it is deleted immediately afterwards and never republished. The returned
 * beats are newly written for the user's own brand.
 */
export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "URL remixing needs ANTHROPIC_API_KEY in .env" },
      { status: 501 }
    );
  }

  const { url, brandBrief } = (await req.json()) as {
    url?: string;
    brandBrief?: string;
  };

  if (!url || !isSupportedSocialUrl(url)) {
    return NextResponse.json(
      { error: "Provide a public Instagram, TikTok, YouTube, Facebook or X URL." },
      { status: 400 }
    );
  }
  if (!brandBrief?.trim()) {
    return NextResponse.json(
      { error: "Describe your own offer so the remix is about your brand, not theirs." },
      { status: 400 }
    );
  }

  let audioRel: string | undefined;
  try {
    const meta = await fetchPostMetadata(url);

    let transcript = "";
    try {
      audioRel = await fetchPostAudio(url, `ingest-${Date.now()}`);
      const words = await transcribeWords(audioRel);
      transcript = words.map((w) => w.text).join(" ");
    } catch (err) {
      // Some posts have no speech, or audio is unavailable — the caption and
      // metadata are still enough for a structural read.
      console.warn("ingest: audio/transcription unavailable:", err);
    }

    const analysis = await remixRecipe({
      transcript,
      caption: meta.description,
      platform: meta.platform,
      durationSeconds: meta.durationSeconds,
      brandBrief: brandBrief.trim(),
    });

    return NextResponse.json({
      source: {
        platform: meta.platform,
        uploader: meta.uploader,
        durationSeconds: meta.durationSeconds,
        hashtags: meta.hashtags.slice(0, 15),
        hadSpeech: transcript.length > 0,
      },
      ...analysis,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Could not read that post: ${msg.slice(0, 300)}` },
      { status: 502 }
    );
  } finally {
    // The source audio is reference material only — remove it.
    if (audioRel) await unlink(absPath(audioRel)).catch(() => {});
  }
}
