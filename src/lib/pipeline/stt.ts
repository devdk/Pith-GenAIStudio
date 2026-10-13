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

/** A block of speech ~15s long, the unit the ranking model reasons about. */
export type Segment = { index: number; start: number; end: number; text: string };

/**
 * Collapse word-level timestamps into segments for the ranking model.
 *
 * Sending word-level JSON to an LLM costs roughly 12x what this does for the
 * same hour of speech, and buys nothing: the model only needs to identify which
 * stretch is worth clipping. Exact cut points are recovered locally afterwards
 * from the word timings, which stay on disk.
 *
 * Segments close on a sentence end or a noticeable pause once they are long
 * enough, so a segment boundary is nearly always a natural place to cut.
 */
export function toSegments(words: Word[], targetSeconds = 15): Segment[] {
  const segments: Segment[] = [];
  let current: Word[] = [];

  const flush = () => {
    if (!current.length) return;
    segments.push({
      index: segments.length,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(" "),
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);
    const span = w.end - current[0].start;
    if (span < targetSeconds) continue;

    const endsSentence = /[.!?]["')\]]?$/.test(w.text);
    const pauseAfter = words[i + 1] ? words[i + 1].start - w.end : Infinity;
    // Close on a natural boundary, or force it if the block has run long.
    if (endsSentence || pauseAfter > 0.5 || span > targetSeconds * 2) flush();
  }
  flush();
  return segments;
}

/** Compact, token-cheap rendering of segments for the model prompt. */
export function renderSegments(segments: Segment[]): string {
  const stamp = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return segments
    .map((s) => `[${s.index}] ${stamp(s.start)} ${s.text}`)
    .join("\n");
}

/** Tokens as authored, keeping original spelling and punctuation. */
const tokenize = (s: string): string[] => s.split(/\s+/).filter(Boolean);

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Align the *authored* narration to the transcript's timings.
 *
 * Speech-to-text is accurate about *when* words are said but not always about
 * spelling — brand names in particular come back wrong ("Swann" -> "Swan"),
 * which would be burned into the captions. So captions are built from the text
 * we wrote, and the transcript is used only for timing.
 *
 * The two token streams don't line up 1:1 (a transcript may merge "C.I.S." into
 * "CIS", or split "glovebox" into "glove box"), so tokens are matched by
 * accumulating whichever side is currently shorter until the normalised text
 * agrees. Where several authored tokens map to one span, the span is divided
 * evenly between them.
 */
export function alignNarration(
  narrations: string[],
  words: Word[]
): { captionWords: Word[]; beatStarts: number[] } {
  const chunks = narrations.map(tokenize);
  const authored = chunks.flat();
  const out: Word[] = [];

  let i = 0; // authored cursor
  let j = 0; // transcript cursor
  while (i < authored.length && j < words.length) {
    let iEnd = i;
    let jEnd = j;
    let aBuf = norm(authored[i]);
    let sBuf = norm(words[j].text);

    // Grow the shorter side until both sides describe the same sounds.
    let guard = 0;
    while (aBuf !== sBuf && guard++ < 6) {
      if (aBuf.length <= sBuf.length && iEnd + 1 < authored.length) {
        iEnd++;
        aBuf += norm(authored[iEnd]);
      } else if (jEnd + 1 < words.length) {
        jEnd++;
        sBuf += norm(words[jEnd].text);
      } else break;
    }

    // Some pairs can never reconcile — the transcript writes numerals ("12")
    // where the script spells them out ("Twelve"). Rather than swallow the
    // tokens we grew past (which would shift every later beat), treat an
    // unresolved pair as 1:1 so the mismatch stays local.
    if (aBuf !== sBuf) {
      iEnd = i;
      jEnd = j;
    }

    const start = words[j].start;
    const end = Math.max(words[jEnd].end, start + 0.08);
    const n = iEnd - i + 1;
    for (let k = 0; k < n; k++) {
      out.push({
        text: authored[i + k],
        start: start + ((end - start) * k) / n,
        end: start + ((end - start) * (k + 1)) / n,
      });
    }
    i = iEnd + 1;
    j = jEnd + 1;
  }

  // Any authored tail the transcript didn't cover: pin to the last known time.
  const tailStart = out.length ? out[out.length - 1].end : 0;
  for (; i < authored.length; i++) {
    out.push({ text: authored[i], start: tailStart, end: tailStart + 0.25 });
  }

  // Beat boundaries are now exact: one aligned entry per authored token.
  const beatStarts: number[] = [];
  let idx = 0;
  for (const chunk of chunks) {
    beatStarts.push(out[Math.min(idx, out.length - 1)]?.start ?? 0);
    idx += chunk.length;
  }
  if (beatStarts.length) beatStarts[0] = 0;

  return { captionWords: out, beatStarts };
}

/** Beat start times only (used by the square presenter composition). */
export function beatStartSeconds(narrations: string[], words: Word[]): number[] {
  return alignNarration(narrations, words).beatStarts;
}
