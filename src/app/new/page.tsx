"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Player } from "@remotion/player";
import { StoryVideo } from "@/remotion/StoryVideo";
import { CartoonVideo } from "@/remotion/cartoon/CartoonVideo";
import { VerticalVideo } from "@/remotion/vertical/VerticalVideo";
import type { CaptionWord } from "@/remotion/vertical/Captions";
import type { Beat } from "@/remotion/types";
import { BG_MODELS, DEFAULT_BG_MODEL, planSegments, type BgModelId } from "@/lib/pipeline/models";

const BG_MODEL_OPTIONS = Object.values(BG_MODELS);

type Style = "BRANDED" | "CARTOON" | "PRESENTER" | "COMMENTARY" | "BROLL" | "SPLIT";
type WizardBeat = Beat & { narration?: string };
type VoiceOption = { id: string; name: string; category: string; inHouse: boolean };

const VERTICAL_STYLES: Style[] = ["COMMENTARY", "BROLL", "SPLIT"];
const FACE_STYLES: Style[] = ["PRESENTER", "COMMENTARY", "SPLIT"];

const STYLE_LABELS: Record<Style, string> = {
  BRANDED: "Branded — square, dark corporate",
  CARTOON: "Cartoon — square, doodle style",
  PRESENTER: "Presenter — square, AI talking head",
  COMMENTARY: "Reel: Commentary — bg + face-cam + captions",
  BROLL: "Reel: Captioned b-roll — bg + captions (fastest)",
  SPLIT: "Reel: Split-screen — face on top, b-roll below",
};

/**
 * Approximate word timings for the live preview. The real render uses exact
 * ElevenLabs word timestamps; this is just so captions animate while editing.
 */
function estimateWords(text: string, wordsPerSecond = 2.6): CaptionWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const step = 1 / wordsPerSecond;
  return tokens.map((t, i) => ({
    text: t.replace(/[^\w£$%'’.!?-]/g, ""),
    start: i * step,
    end: (i + 1) * step - 0.03,
  }));
}

const starterBeats: WizardBeat[] = [
  {
    type: "hook",
    durationInFrames: 90,
    eyebrow: "For UK businesses",
    title: "Your website is costing you clients.",
    subtitle: "You just can't see it.",
    narration: "Ever clicked a website and waited, and waited? So do your customers.",
  },
  {
    type: "stat",
    durationInFrames: 90,
    value: "53",
    unit: "%",
    label: "give up after a 3-second wait",
    narration: "Over half of visitors give up if a page takes more than three seconds to load.",
  },
  {
    type: "solution",
    durationInFrames: 130,
    eyebrow: "The fix",
    title: "A site built to convert",
    bullets: ["Conversion-first design", "SEO baked in", "Launched in weeks"],
    narration: "The fix? Conversion-first design, SEO baked in, launched in weeks.",
  },
  {
    type: "cta",
    durationInFrames: 90,
    title: "Let's build yours.",
    subtitle: "offer.mirasphere.digital",
    cta: "Book a call",
    narration: "Head to offer dot mirasphere dot digital and book a call.",
  },
  {
    type: "logo",
    durationInFrames: 75,
    fixed: true,
    brand: "Mirasphere",
    tagline: "Websites that win clients",
    narration: "Mirasphere. Websites that win clients.",
  },
];

const beatFields: Record<string, string[]> = {
  hook: ["eyebrow", "title", "subtitle"],
  problem: ["eyebrow", "title", "body"],
  stat: ["value", "unit", "label"],
  insight: ["eyebrow", "body", "subtitle"],
  solution: ["eyebrow", "title", "bullets"],
  cta: ["title", "subtitle", "cta"],
  logo: ["brand", "tagline"],
};

const input =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-500";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";

export default function NewVideo() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [style, setStyle] = useState<Style>("BRANDED");
  const [accent, setAccent] = useState("#8c52ff");
  const [silent, setSilent] = useState(false);
  const [beats, setBeats] = useState<WizardBeat[]>(starterBeats);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 9:16 reel settings
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [useOwnFootage, setUseOwnFootage] = useState(false);
  const [bgModel, setBgModel] = useState<BgModelId>(DEFAULT_BG_MODEL);
  const [captionStyle, setCaptionStyle] = useState<"bold" | "karaoke" | "boxed">("bold");
  const [headline, setHeadline] = useState("");
  const [brand, setBrand] = useState("");

  // Remix-from-URL
  const [sourceUrl, setSourceUrl] = useState("");
  const [remixNote, setRemixNote] = useState<string | null>(null);

  const isVertical = VERTICAL_STYLES.includes(style);
  const needsFace = FACE_STYLES.includes(style);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => (r.ok ? r.json() : []))
      .then((v: VoiceOption[]) => {
        setVoices(v);
        if (v.length && !voiceId) setVoiceId(v[0].id);
      })
      .catch(() => {});
    fetch("/api/ai-draft")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBeat = (i: number, patch: Partial<WizardBeat>) =>
    setBeats((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const previewProps = useMemo(
    () => ({ beats: beats.map((b) => ({ ...b, accent })), transitionDurationInFrames: 16 }),
    [beats, accent]
  );
  const previewFrames = useMemo(
    () =>
      Math.max(
        60,
        beats.reduce((s, b) => s + Math.max(1, b.durationInFrames), 0) -
          (beats.length - 1) * 16
      ),
    [beats]
  );

  const narrationText = useMemo(
    () => beats.map((b) => (b.narration ?? "").trim()).filter(Boolean).join(" "),
    [beats]
  );

  const selectedModel = BG_MODELS[bgModel];
  /**
   * How many generations this reel will cost, using the same segment packing
   * the worker applies — estimated from the narration length per beat.
   */
  const estimatedGenerations = useMemo(() => {
    let t = 0;
    const spans = beats.map((b): [number, number] => {
      const words = (b.narration ?? "").split(/\s+/).filter(Boolean).length;
      const dur = Math.max(1, words / 2.6);
      const span: [number, number] = [t, t + dur];
      t += dur;
      return span;
    });
    return spans.length ? planSegments(selectedModel, spans).length : 0;
  }, [beats, selectedModel]);
  const verticalPreview = useMemo(() => {
    const words = estimateWords(narrationText);
    const seconds = Math.max(4, words.length ? words[words.length - 1].end + 0.4 : 8);
    return {
      props: {
        layout: (style === "COMMENTARY"
          ? "commentary"
          : style === "SPLIT"
            ? "split"
            : "broll") as "commentary" | "split" | "broll",
        durationInSeconds: seconds,
        words,
        captionStyle,
        accent,
        headline: headline || undefined,
        brand: brand || undefined,
      },
      frames: Math.max(60, Math.round(seconds * 30)),
    };
  }, [narrationText, style, captionStyle, accent, headline, brand]);

  async function aiDraft() {
    setBusy("Drafting with AI…");
    setError(null);
    try {
      const res = await fetch("/api/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "draft failed");
      if (Array.isArray(json.beats)) setBeats(json.beats);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  async function remixFromUrl() {
    setBusy("Reading the post…");
    setError(null);
    setRemixNote(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl.trim(), brandBrief: brief }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ingest failed");
      if (Array.isArray(json.beats)) setBeats(json.beats);
      if (json.suggestedLayout) {
        const map: Record<string, Style> = {
          commentary: "COMMENTARY",
          broll: "BROLL",
          split: "SPLIT",
        };
        if (map[json.suggestedLayout]) setStyle(map[json.suggestedLayout]);
      }
      setRemixNote(
        [
          json.formatSummary,
          json.hookTechnique ? `Hook: ${json.hookTechnique}` : "",
          json.pacingNotes ? `Pacing: ${json.pacingNotes}` : "",
          json.source?.hadSpeech === false
            ? "No speech detected — structure inferred from the caption only."
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  async function uploadAsset(file: File, kind: "PHOTO" | "VIDEO"): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (kind === "PHOTO") fd.append("consent", String(consent));
    const up = await fetch("/api/assets", { method: "POST", body: fd });
    const upJson = await up.json();
    if (!up.ok) throw new Error(upJson.error ?? `${kind.toLowerCase()} upload failed`);
    return upJson.id as string;
  }

  async function submit() {
    setBusy("Creating…");
    setError(null);
    try {
      let photoId: string | undefined;
      let backgroundId: string | undefined;
      if (needsFace) {
        if (!photoFile) throw new Error("Upload a presenter photo.");
        photoId = await uploadAsset(photoFile, "PHOTO");
      }
      if (isVertical && useOwnFootage && bgFile) {
        setBusy("Uploading background…");
        backgroundId = await uploadAsset(bgFile, "VIDEO");
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Untitled video",
          style,
          beats,
          voiceId: voiceId || undefined,
          silent: isVertical ? false : silent,
          accent,
          photoId,
          backgroundId,
          captionStyle,
          bgModel,
          headline: headline || undefined,
          brand: brand || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Check the form for errors."
        );
      }
      router.push(`/projects/${json.id}`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">New video</h1>

        {aiEnabled ? (
          <div className="rounded-xl border border-violet-800/60 bg-violet-950/30 p-4">
            <div className={label}>AI draft — describe the offer, audience and goal</div>
            <textarea
              className={`${input} h-20`}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Web design offer for UK trades businesses; pain: slow outdated sites; CTA: book a call at offer.mirasphere.digital"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={aiDraft}
                disabled={!brief.trim() || !!busy}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
              >
                Draft beats with AI
              </button>
            </div>

            {/* Remix the structure of an existing post into an original script. */}
            <div className="mt-4 border-t border-violet-800/50 pt-4">
              <div className={label}>Or remix a post you like</div>
              <input
                className={input}
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/…  ·  tiktok.com/…  ·  youtube.com/shorts/…"
              />
              <button
                onClick={remixFromUrl}
                disabled={!sourceUrl.trim() || !brief.trim() || !!busy}
                className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
              >
                Analyse & remix
              </button>
              <p className="mt-2 text-xs text-slate-400">
                Reads the post&apos;s hook, structure and pacing, then writes an{" "}
                <strong>original</strong> script for the offer above. The source
                footage is never reused — fill in the brief first.
              </p>
              {remixNote ? (
                <div className="mt-3 rounded-lg bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                  {remixNote}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Name</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="July offer promo" />
          </div>
          <div>
            <label className={label}>Style</label>
            <select className={input} value={style} onChange={(e) => setStyle(e.target.value as Style)}>
              <optgroup label="Square 1:1 (feed)">
                <option value="BRANDED">{STYLE_LABELS.BRANDED}</option>
                <option value="CARTOON">{STYLE_LABELS.CARTOON}</option>
                <option value="PRESENTER">{STYLE_LABELS.PRESENTER}</option>
              </optgroup>
              <optgroup label="Vertical 9:16 (Reels / TikTok / Shorts)">
                <option value="COMMENTARY">{STYLE_LABELS.COMMENTARY}</option>
                <option value="BROLL">{STYLE_LABELS.BROLL}</option>
                <option value="SPLIT">{STYLE_LABELS.SPLIT}</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className={label}>Accent color</label>
            <input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900" value={accent} onChange={(e) => setAccent(e.target.value)} />
          </div>
          <div>
            <label className={label}>Voice</label>
            <select className={input} value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={silent}>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.inHouse ? "(cloned)" : v.category === "premade" ? "" : `(${v.category})`}
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={isVertical ? false : silent}
                onChange={(e) => setSilent(e.target.checked)}
                disabled={needsFace || isVertical}
              />
              Silent video (no narration
              {needsFace || isVertical ? " — this format needs narration" : ""})
            </label>
          </div>
        </div>

        {isVertical ? (
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="col-span-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
              Reel settings · 1080×1920
            </div>
            <div className="col-span-2 rounded-lg border border-violet-800/50 bg-violet-950/20 p-3">
              <div className="text-sm font-semibold text-violet-200">
                AI backgrounds — a scene per beat
              </div>
              <div className="mt-2">
                <label className={label}>Background model</label>
                <select
                  className={input}
                  value={bgModel}
                  onChange={(e) => setBgModel(e.target.value as BgModelId)}
                >
                  {BG_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">{selectedModel.note}</p>
              </div>
              <p className="mt-2 rounded bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                Estimated <strong>{estimatedGenerations}</strong> background
                generation{estimatedGenerations === 1 ? "" : "s"} for {beats.length}{" "}
                beats
                {selectedModel.multiShot
                  ? " (beats become shots inside one clip)"
                  : " (one per beat)"}
                . {selectedModel.resolutionNote}. Scenes you don&apos;t change are
                reused on re-renders.
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={useOwnFootage}
                  onChange={(e) => {
                    setUseOwnFootage(e.target.checked);
                    if (!e.target.checked) setBgFile(null);
                  }}
                />
                Use my own footage instead (single clip, looped)
              </label>
              {useOwnFootage ? (
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(e) => setBgFile(e.target.files?.[0] ?? null)}
                  className="mt-2 text-sm"
                />
              ) : null}
            </div>
            <div>
              <label className={label}>Caption style</label>
              <select
                className={input}
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value as "bold" | "karaoke" | "boxed")}
              >
                <option value="bold">Bold — white, active word in accent</option>
                <option value="karaoke">Karaoke — upcoming words dimmed</option>
                <option value="boxed">Boxed — highlighted block</option>
              </select>
            </div>
            <div>
              <label className={label}>Brand watermark (optional)</label>
              <input className={input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Mirasphere" />
            </div>
            <div className="col-span-2">
              <label className={label}>Pinned headline (optional)</label>
              <input
                className={input}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Your website is costing you clients"
              />
            </div>
          </div>
        ) : null}

        {needsFace ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <label className={label}>Presenter photo (clear, front-facing)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              I confirm this person has consented to their likeness and voice being used in generated videos.
            </label>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Beats</h2>
            <button
              onClick={() =>
                setBeats((bs) => [...bs, { type: "problem", durationInFrames: 100, narration: "" }])
              }
              className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:border-slate-500"
            >
              + Add beat
            </button>
          </div>
          {beats.map((b, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <select
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={b.type}
                  onChange={(e) => updateBeat(i, { type: e.target.value as Beat["type"] })}
                >
                  {Object.keys(beatFields).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={() => setBeats((bs) => bs.filter((_, j) => j !== i))}
                  className="text-xs text-slate-500 hover:text-rose-400"
                >
                  remove
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {beatFields[b.type].map((f) => (
                  <div key={f} className={f === "bullets" || f === "body" ? "col-span-2" : ""}>
                    <label className={label}>{f}</label>
                    {f === "bullets" ? (
                      <textarea
                        className={`${input} h-16`}
                        placeholder="One bullet per line"
                        value={(b.bullets ?? []).join("\n")}
                        onChange={(e) =>
                          updateBeat(i, { bullets: e.target.value.split("\n").filter(Boolean) })
                        }
                      />
                    ) : (
                      <input
                        className={input}
                        value={String((b as Record<string, unknown>)[f] ?? "")}
                        onChange={(e) => updateBeat(i, { [f]: e.target.value } as Partial<WizardBeat>)}
                      />
                    )}
                  </div>
                ))}
                {!silent ? (
                  <div className="col-span-2">
                    <label className={label}>narration (what the voice says during this beat)</label>
                    <textarea
                      className={`${input} h-14`}
                      value={b.narration ?? ""}
                      onChange={(e) => updateBeat(i, { narration: e.target.value })}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {error ? <div className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div> : null}

        <button
          onClick={submit}
          disabled={!!busy}
          className="w-full rounded-xl bg-violet-600 py-3 font-semibold hover:bg-violet-500 disabled:opacity-40"
        >
          {busy ?? "Generate video"}
        </button>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className={label}>
          Live preview{" "}
          {isVertical
            ? "· 9:16 (captions timed approximately)"
            : style === "PRESENTER"
              ? "(text layout — presenter is added at render)"
              : "(silent)"}
        </div>
        <div
          className={`overflow-hidden rounded-xl border border-slate-800 ${isVertical ? "mx-auto max-w-[300px]" : ""}`}
        >
          {isVertical ? (
            <Player
              component={VerticalVideo}
              inputProps={verticalPreview.props}
              durationInFrames={verticalPreview.frames}
              fps={30}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ width: "100%", aspectRatio: "9/16" }}
              controls
              loop
            />
          ) : (
            <Player
              component={style === "CARTOON" ? CartoonVideo : StoryVideo}
              inputProps={previewProps}
              durationInFrames={previewFrames}
              fps={30}
              compositionWidth={1080}
              compositionHeight={1080}
              style={{ width: "100%", aspectRatio: "1/1" }}
              controls
              loop
            />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {isVertical
            ? "Placeholder background — the render generates a separate AI scene per beat. Caption timing here is estimated; the render uses exact word timestamps and the lip-synced presenter."
            : "Preview plays the on-screen beats without narration. Final timing stretches to the voiceover."}
        </p>
      </div>
    </div>
  );
}
