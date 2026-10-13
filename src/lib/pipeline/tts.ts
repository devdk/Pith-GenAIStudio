import { ELEVENLABS_API_KEY, requireEnv } from "../env";
import { saveFile } from "../storage";
import { probeDurationSeconds } from "./ffmpeg";

export type TtsResult = { relPath: string; durationSeconds: number };

/** Generate narration via ElevenLabs and store it under storage/public/. */
export async function generateVoiceover(opts: {
  text: string;
  voiceId: string;
  fileBase: string;
  speed?: number;
}): Promise<TtsResult> {
  const key = requireEnv("ELEVENLABS_API_KEY", ELEVENLABS_API_KEY);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { speed: opts.speed ?? 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  const audio = Buffer.from(await res.arrayBuffer());

  // Save first, then measure with ffmpeg — robust across the container quirks
  // that trip header-parsing libraries under some module loaders.
  const relPath = await saveFile(`public/${opts.fileBase}.mp3`, audio);
  const durationSeconds = await probeDurationSeconds(relPath);
  if (!durationSeconds) throw new Error("could not measure narration duration");

  return { relPath, durationSeconds };
}
