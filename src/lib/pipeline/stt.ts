import { readFile } from "node:fs/promises";
import { ELEVENLABS_API_KEY, requireEnv } from "../env";
import { absPath } from "../storage";

export type Word = { text: string; start: number; end: number };

/** Word-level timestamps of a narration file via ElevenLabs Scribe. */
export async function transcribeWords(relPath: string): Promise<Word[]> {
  const key = requireEnv("ELEVENLABS_API_KEY", ELEVENLABS_API_KEY);
  const audio = await readFile(absPath(relPath));

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }),
    "narration.mp3"
  );

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    words?: Array<{ type: string; text: string; start: number; end: number }>;
  };
  return (json.words ?? [])
    .filter((w) => w.type === "word")
    .map((w) => ({ text: w.text, start: w.start, end: w.end }));
}

const countWords = (s: string): number =>
  (s.match(/[A-Za-z0-9£$%’']+(?:\.[A-Za-z0-9]+)*/g) ?? []).length;

/**
 * Map per-beat narration chunks to start times by walking the transcript
 * word-by-word. Tokenisation can drift slightly (URLs, numbers), so this is
 * proportional-safe: it never overruns the word list.
 */
export function beatStartSeconds(narrations: string[], words: Word[]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const chunk of narrations) {
    starts.push(words[Math.min(cursor, words.length - 1)]?.start ?? 0);
    cursor += countWords(chunk);
  }
  starts[0] = 0;
  return starts;
}
