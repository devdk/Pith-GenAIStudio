"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Source = {
  id: string;
  title: string;
  sourceUrl?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
  jobs: Array<{ state: string; step: string; error?: string | null }>;
  _count: { clips: number };
};

const input =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-500";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";

const stateStyles: Record<string, string> = {
  DONE: "bg-emerald-500/15 text-emerald-300",
  RUNNING: "bg-sky-500/15 text-sky-300 animate-pulse",
  QUEUED: "bg-slate-500/15 text-slate-300",
  FAILED: "bg-rose-500/15 text-rose-300",
};

export default function ClipsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [brief, setBrief] = useState("");
  const [minClipSeconds, setMin] = useState(20);
  const [maxClipSeconds, setMax] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/sources", { cache: "no-store" });
      if (res.ok) setSources(await res.json());
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          brief: brief.trim() || undefined,
          minClipSeconds,
          maxClipSeconds,
          title: "",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Check the form.");
      }
      setUrl("");
      setBrief("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Clip finder</h1>
      <p className="mt-1 text-sm text-slate-400">
        Point it at a long video or podcast. It transcribes the whole thing, then
        ranks the stretches that stand alone as shorts — you review the picks
        before anything gets rendered.
      </p>

      <div className="mt-6 space-y-4 rounded-xl border border-violet-800/60 bg-violet-950/30 p-5">
        <div>
          <label className={label}>Video URL</label>
          <input
            className={input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…  ·  a podcast episode link"
          />
        </div>
        <div>
          <label className={label}>What are you looking for? (steers the ranking)</label>
          <textarea
            className={`${input} h-20`}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. Moments where he pushes back on common bookkeeping advice — for UK tradespeople on Reels"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Min clip length (s)</label>
            <input
              type="number"
              className={input}
              value={minClipSeconds}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>Max clip length (s)</label>
            <input
              type="number"
              className={input}
              value={maxClipSeconds}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          </div>
        </div>
        {error ? (
          <div className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
        ) : null}
        <button
          onClick={submit}
          disabled={busy || !url.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
        >
          {busy ? "Queueing…" : "Find clips"}
        </button>
        <p className="text-xs text-slate-500">
          Transcription dominates the wait — roughly a minute per 10 minutes of
          audio. Ranking itself costs a few pence.
        </p>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Sources
      </h2>
      {sources.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nothing harvested yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {sources.map((s) => {
            const job = s.jobs[0];
            return (
              <li key={s.id}>
                <Link
                  href={`/clips/${s.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-slate-600"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {s.durationSeconds
                        ? `${Math.round(s.durationSeconds / 60)} min · `
                        : ""}
                      {s._count.clips} clips ·{" "}
                      {new Date(s.createdAt).toLocaleString("en-GB")}
                    </div>
                  </div>
                  {job ? (
                    <span
                      className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-medium ${stateStyles[job.state] ?? ""}`}
                    >
                      {job.state === "RUNNING" ? job.step : job.state.toLowerCase()}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
