import { ANTHROPIC_API_KEY } from "../env";

/**
 * Scripting, art direction and clip ranking all run on Sonnet 5.5: long-context
 * judgement work where a whole hour-long transcript fits in one pass and the
 * per-run cost is pennies. Override per call where a task needs more.
 */
const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";

async function askClaude(
  system: string,
  user: string,
  maxTokens = 2000,
  model: string = MODEL,
  /**
   * JSON Schema for the reply. When supplied the API constrains the output, so
   * the response is guaranteed-valid JSON rather than prose we have to fish a
   * JSON object out of — which is where this pipeline kept breaking.
   */
  schema?: Record<string, unknown>
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("AI features need ANTHROPIC_API_KEY in .env");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      ...(schema
        ? { output_config: { format: { type: "json_schema", schema } } }
        : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };
  // A reply cut off at the token ceiling yields half a JSON object; say so
  // rather than failing later with an opaque parse error.
  if (json.stop_reason === "max_tokens") {
    throw new Error(
      "the model hit its output limit before finishing — raise max_tokens or ask for fewer items"
    );
  }
  return json.content.find((c) => c.type === "text")?.text ?? "";
}

/**
 * Pull a JSON object out of a free-text reply.
 *
 * Only needed for calls that don't use a schema. A greedy brace match breaks on
 * markdown fences and on trailing commentary, so fences are stripped first and
 * the object is located by walking braces (ignoring those inside strings).
 */
function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

  // Fast path: the whole reply is the object (what a schema-constrained call gives).
  if (cleaned.startsWith("{")) {
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      /* fall through to brace walking */
    }
  }

  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("model returned no JSON");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      return JSON.parse(cleaned.slice(start, i + 1)) as T;
    }
  }
  throw new Error("model returned incomplete JSON (unbalanced braces)");
}


const BEATS_SPEC = `Each beat has: type, durationInFrames, narration (1-2 spoken
sentences carrying the detail), and on-screen fields:
hook: eyebrow, title (max 8 words), subtitle
stat: value (number only), unit, label (max 10 words)
problem: eyebrow, title (max 8 words), body (max 14 words)
solution: eyebrow, title (max 6 words), bullets (3 max, 8 words each)
cta: title (max 6 words), subtitle (the URL), cta (2-3 word button)
logo: brand, tagline (max 6 words)
Durations: hook/stat/cta 90, problem 100, solution 130, logo 75.
Screen text carries punchlines; narration carries detail. UK English.`;

export type DraftedBeats = { beats: Array<Record<string, unknown>> };

/** Turn a plain-English brief into an editable beat list. */
export async function draftBeats(brief: string): Promise<DraftedBeats> {
  const text = await askClaude(
    `You write scripts for short square social videos (25-40s).
Given a brief, produce a JSON object with a "beats" array. Beat types, in a
sensible order: hook, stat, problem, solution, cta, logo.
${BEATS_SPEC}
Return ONLY the JSON object.`,
    brief
  );
  return extractJson<DraftedBeats>(text);
}

export type SourceAnalysis = {
  /** What makes the source work — shown to the user, not rendered. */
  formatSummary: string;
  hookTechnique: string;
  pacingNotes: string;
  suggestedLayout: "commentary" | "broll" | "split";
  beats: Array<Record<string, unknown>>;
};

/**
 * Analyse a source post's structure and produce an ORIGINAL script in the same
 * style, for the user's own brand.
 *
 * This deliberately extracts the *recipe* (hook technique, beat structure,
 * pacing) rather than copying wording: the transcript is reference material for
 * structural analysis, and the output must be newly written.
 */
export async function remixRecipe(input: {
  transcript: string;
  caption?: string;
  platform: string;
  durationSeconds?: number;
  brandBrief: string;
}): Promise<SourceAnalysis> {
  const system = `You are a short-form video strategist. You are shown a
competitor/reference post: its transcript and caption. Your job is to identify
WHY it works structurally, then write a COMPLETELY ORIGINAL script for the
user's own brand and offer in that same style.

Hard rules:
- Never reuse the source's sentences, phrases, or specific claims. Write new copy.
- Do not reference the original creator, their brand, or their product.
- Borrow only structure: hook technique, beat order, pacing, energy, CTA placement.
- If the source makes factual claims, do NOT repeat them; use the user's own facts.

Return ONLY a JSON object with:
  formatSummary: one sentence on the format (e.g. "fast-cut b-roll with punchy captions")
  hookTechnique: one sentence on how the first 3 seconds grab attention
  pacingNotes: one sentence on rhythm (cuts per second, sentence length)
  suggestedLayout: one of "commentary" | "broll" | "split"
  beats: array of beats for the NEW original video
${BEATS_SPEC}`;

  const user = `REFERENCE POST (${input.platform}${
    input.durationSeconds ? `, ${Math.round(input.durationSeconds)}s` : ""
  })

--- transcript (reference only, do not reuse wording) ---
${input.transcript.slice(0, 6000) || "(no speech detected)"}

--- caption ---
${(input.caption ?? "").slice(0, 1500) || "(none)"}

--- THE USER'S OWN BRAND AND OFFER (write about THIS) ---
${input.brandBrief}`;

  return extractJson<SourceAnalysis>(await askClaude(system, user, 3000));
}

/**
 * Write one cinematic b-roll prompt per beat, so the background actually
 * illustrates what is being said at that moment instead of looping.
 */
export async function visualPromptsForBeats(
  beats: Array<Record<string, unknown>>
): Promise<string[]> {
  const summary = beats
    .map((b, i) => {
      const bits = [
        b.type,
        b.eyebrow,
        b.title,
        b.subtitle,
        b.body,
        b.label,
        b.value ? `${b.value}${b.unit ?? ""}` : "",
        Array.isArray(b.bullets) ? (b.bullets as string[]).join("; ") : "",
        b.narration,
      ]
        .filter(Boolean)
        .join(" | ");
      return `${i}: ${bits}`;
    })
    .join("\n");

  const text = await askClaude(
    `You art-direct vertical (9:16) background footage for short social videos.
For EACH numbered beat, write one prompt for a 5-second cinematic b-roll clip
that visually illustrates that beat's message.

Rules for every prompt:
- Describe a real, filmable scene: subject, action, camera move, lighting, mood.
- Vertical framing, shallow depth of field, modern and premium looking.
- NO text, letters, numbers, logos, UI screenshots or captions in frame
  (captions are added separately and would clash).
- NO person talking to camera (a presenter is composited on top).
- Keep continuity: same visual world, palette and grade across all beats.
- 25-45 words each.

Return ONLY a JSON object: { "prompts": ["...", "..."] } with exactly one
prompt per beat, in order.`,
    summary,
    2500
  );
  const parsed = extractJson<{ prompts?: string[] }>(text);
  const prompts = parsed.prompts ?? [];
  if (prompts.length !== beats.length) {
    // Pad or trim so callers can rely on index alignment.
    while (prompts.length < beats.length) {
      prompts.push(
        "Slow cinematic push through a bright modern office, soft daylight, shallow depth of field, calm premium mood, no text on screen"
      );
    }
    prompts.length = beats.length;
  }
  return prompts;
}

/**
 * Apply a free-text change request to an existing beat list.
 *
 * Returns the full updated list plus a short note on what changed, so the user
 * can see whether the edit was understood before re-rendering.
 */
export async function refineBeats(input: {
  beats: Array<Record<string, unknown>>;
  instruction: string;
}): Promise<{ beats: Array<Record<string, unknown>>; changeNote: string }> {
  const text = await askClaude(
    `You edit the beat list of a short social video. You are given the current
beats as JSON and a change request. Apply the request faithfully.

Rules:
- Preserve beats the request doesn't touch — copy them through byte-for-byte.
- Keep the same JSON shape and field names.
- You may add, remove, reorder, reword or retime beats if asked.
- Keep copy tight: titles max 8 words, bullets max 8 words, narration 1-2 sentences.
- If a beat's message changes, update its narration to match.
${BEATS_SPEC}

Return ONLY: { "beats": [...], "changeNote": "one sentence on what you changed" }`,
    `CURRENT BEATS:\n${JSON.stringify(input.beats, null, 1)}\n\nCHANGE REQUEST:\n${input.instruction}`,
    4000
  );
  const parsed = extractJson<{
    beats?: Array<Record<string, unknown>>;
    changeNote?: string;
  }>(text);
  if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
    throw new Error("the edit produced no beats — try rephrasing the request");
  }
  return {
    beats: parsed.beats,
    changeNote: parsed.changeNote ?? "Beats updated.",
  };
}

export type ClipCandidate = {
  startSegment: number;
  endSegment: number;
  score: number;
  title: string;
  reason: string;
};

/**
 * Identify the stretches of a long video that stand alone as shorts.
 *
 * The model works on segment indices rather than timestamps: indices are
 * unambiguous, cheap to emit, and can't drift. Exact cut points are recovered
 * from the word-level timings locally.
 *
 * Uses Sonnet 5.5 — a long-context judgement task where the whole transcript
 * fits in one pass, and the per-run cost is pennies.
 */
export async function rankClips(input: {
  segmentsText: string;
  brief?: string;
  minSeconds: number;
  maxSeconds: number;
  maxClips?: number;
}): Promise<ClipCandidate[]> {
  const system = `You find the moments in a long video or podcast that work as
standalone short-form clips (Reels, Shorts, TikTok).

You are given a numbered, timestamped transcript. Each line is one segment.
Return the best candidate clips as ranges of segment indices.

What makes a clip work — judge against these, in order:
1. HOOK: the opening seconds must earn attention on their own — a question, a
   bold or contrarian claim, a surprising number, or a pattern interrupt.
   A clip that opens with throat-clearing or mid-thought context is worthless.
2. SELF-CONTAINED: it must make sense cold, with no knowledge of what came
   before. Reject anything that leans on "as I said", "going back to that", or
   an unexplained "it"/"they".
3. ONE IDEA: a single point carried to a conclusion. Not a meander.
4. PAYOFF: it resolves — a punchline, a lesson, a number, a turn in a story.
   A clip that trails off is a failed clip even if the content is good.
5. EMOTIONAL OR CONTRARIAN CHARGE: disagreement, surprise, strong opinion,
   vulnerability, or a myth being broken all travel further than neutral
   explanation.

Hard rules:
- Clips must be between ${input.minSeconds} and ${input.maxSeconds} seconds.
- Start and end on segment boundaries (they fall on sentence ends or pauses).
- Ranges must NOT overlap each other.
- Prefer fewer excellent clips over many mediocre ones. If only three stretches
  are genuinely good, return three.
- score is 0-100: your honest confidence it performs as a standalone short.
  Use the full range. Do not cluster everything at 80.
- title is the hook as it would appear on screen: max 8 words, no clickbait
  that the clip doesn't actually deliver.
- reason is one sentence on WHY it works, naming the specific mechanism
  (e.g. "opens on a counterintuitive number and resolves it in 20s").

Return ONLY JSON: { "clips": [ { "startSegment": n, "endSegment": n,
"score": n, "title": "...", "reason": "..." } ] }`;

  const user = `${
    input.brief
      ? `WHAT THE USER WANTS (rank hard against this — a brilliant clip that ignores this brief is less useful than a good clip that serves it):\n${input.brief}\n\n`
      : ""
  }TRANSCRIPT (segment index, timestamp, text):\n${input.segmentsText}`;

  const CLIP_SCHEMA = {
    type: "object",
    properties: {
      clips: {
        type: "array",
        items: {
          type: "object",
          properties: {
            startSegment: { type: "integer" },
            endSegment: { type: "integer" },
            score: { type: "integer" },
            title: { type: "string" },
            reason: { type: "string" },
          },
          required: ["startSegment", "endSegment", "score", "title", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["clips"],
    additionalProperties: false,
  };

  const text = await askClaude(system, user, 16000, MODEL, CLIP_SCHEMA);
  const parsed = extractJson<{ clips?: ClipCandidate[] }>(text);
  const clips = (parsed.clips ?? []).filter(
    (c) =>
      Number.isInteger(c.startSegment) &&
      Number.isInteger(c.endSegment) &&
      c.endSegment >= c.startSegment
  );
  clips.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return input.maxClips ? clips.slice(0, input.maxClips) : clips;
}

export type ClipPackaging = {
  hookText: string;
  caption: string;
  hashtags: string[];
};

/**
 * Write the packaging for one clip: the on-screen hook, plus the caption and
 * hashtags that ship with the post.
 *
 * The hook is the single highest-leverage element — it is burned over the first
 * ~1.5s and decides whether anyone sees the rest — so it gets explicit rules
 * rather than being lumped in with the caption.
 */
export async function packageClip(input: {
  transcript: string;
  suggestedTitle?: string;
  platform?: string;
}): Promise<ClipPackaging> {
  const system = `You package short-form video clips for Instagram Reels.

Return ONLY JSON with: hookText, caption, hashtags.

hookText — burned over the first 1.5 seconds, the thing that stops the scroll:
- MAXIMUM 7 words. Shorter is better. It must be readable at a glance.
- Create an open loop: a question, a stake, a contradiction, or a number.
- It must be honestly delivered by the clip. Never promise what isn't there —
  a hook the clip doesn't pay off costs you the next view, not just this one.
- No "In this video", no hashtags, no emoji, no trailing punctuation.
- Write it as a human speaks, not as a headline. "Nobody tells you this"
  beats "The Untold Truth About X".

caption — the post caption:
- First line does the work: most of it is hidden behind "more".
- 1-3 short lines, then a soft question inviting a reply (comments and sends
  are weighted far more heavily than likes).
- Plain text, at most one emoji, UK English. No hashtags in this field.

hashtags — 5 to 8, lowercase, no spaces, no duplicates. Mix one or two broad
tags with several specific ones; broad-only tags bury a post in competition.`;

  const user = `CLIP TRANSCRIPT:\n${input.transcript.slice(0, 4000)}${
    input.suggestedTitle ? `\n\nWorking title: ${input.suggestedTitle}` : ""
  }`;

  const schema = {
    type: "object",
    properties: {
      hookText: { type: "string" },
      caption: { type: "string" },
      hashtags: { type: "array", items: { type: "string" } },
    },
    required: ["hookText", "caption", "hashtags"],
    additionalProperties: false,
  };

  const text = await askClaude(system, user, 2000, MODEL, schema);
  const parsed = extractJson<ClipPackaging>(text);
  return {
    hookText: (parsed.hookText ?? "").slice(0, 80),
    caption: parsed.caption ?? "",
    hashtags: (parsed.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)),
  };
}

export type PostCaption = { caption: string; hashtags: string[] };

/** Write the social caption + hashtags that ship with the finished video. */
export async function generatePostCaption(input: {
  script: string;
  platform?: string;
}): Promise<PostCaption> {
  const text = await askClaude(
    `You write captions for short-form social video posts. Given the video's
narration, return ONLY a JSON object:
  caption: 1-3 short lines. Open with a hook line, end with a clear CTA.
           Plain text, line breaks allowed, at most one emoji. UK English.
  hashtags: 5-10 relevant hashtags, lowercase, no spaces, without duplicates.
Do not put the hashtags inside the caption field.`,
    `Platform: ${input.platform ?? "instagram reels"}\n\nNarration:\n${input.script.slice(0, 4000)}`,
    1000
  );
  const parsed = extractJson<PostCaption>(text);
  return {
    caption: parsed.caption ?? "",
    hashtags: (parsed.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)),
  };
}
