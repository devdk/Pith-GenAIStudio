"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Clip = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  score: number;
  title?: string | null;
  reason?: string | null;
  transcriptText?: string | null;
  status: string;
  layout: string;
  hookText?: string | null;
  outputPath?: string | null;
  postCaption?: string | null;
  hashtagsJson?: string | null;
  jobs: Array<{ state: string; step: string; error?: string | null }>;
};
type Source = {
  id: string;
  title: string;
  sourceUrl?: string | null;
  videoPath?: string | null;
  durationSeconds?: number | null;
  brief?: string | null;
  jobs: Array<{ state: string; step: string; error?: string | null }>;
  clips: Clip[];
};

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-300";
  if (score >= 60) return "bg-amber-500/15 text-amber-300";
  return "bg-slate-500/15 text-slate-400";
}

export default function SourceReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [source, setSource] = useState<Source | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/sources/${id}`, { cache: "no-store" });
      if (res.ok && !stop) setSource(await res.json());
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id]);

  /** Play just this clip's range, stopping at its end. */
  function preview(clip: Clip) {
    const v = videoRef.current;
    if (!v) return;
    setPlaying(clip.id);
    v.currentTime = clip.startSeconds;
    void v.play();
    const stopAt = () => {
      if (v.currentTime >= clip.endSeconds) {
        v.pause();
        setPlaying(null);
        v.removeEventListener("timeupdate", stopAt);
      }
    };
    v.addEventListener("timeupdate", stopAt);
  }

  async function renderClip(clipId: string, layout: "card" | "fill") {
    await fetch(`/api/clips/${clipId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    // The poll picks up progress from here.
  }

  async function setStatus(clipId: string, status: string) {
    setSource((s) =>
      s ? { ...s, clips: s.clips.map((c) => (c.id === clipId ? { ...c, status } : c)) } : s
    );
    await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  if (!source) return <div className="text-slate-400">Loading…</div>;

  const job = source.jobs[0];
  const running = job && (job.state === "RUNNING" || job.state === "QUEUED");
  const approved = source.clips.filter((c) => c.status === "APPROVED").length;

  return (
    <div className="max-w-4xl">
      <Link href="/clips" className="text-sm text-slate-400 hover:text-white">
        ← All sources
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{source.title}</h1>
      <div className="mt-1 text-sm text-slate-400">
        {source.durationSeconds ? `${Math.round(source.durationSeconds / 60)} min · ` : ""}
        {source.clips.length} candidates
        {approved ? ` · ${approved} approved` : ""}
      </div>
      {source.brief ? (
        <p className="mt-2 rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          Brief: {source.brief}
        </p>
      ) : null}

      {running ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-ping rounded-full bg-sky-400" />
            <span className="font-medium">{job.step}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Downloading and transcribing dominate the wait. This page refreshes itself.
          </p>
        </div>
      ) : job?.state === "FAILED" ? (
        <div className="mt-6 rounded-xl border border-rose-900 bg-rose-950/40 p-5">
          <div className="font-semibold text-rose-300">Harvest failed</div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-rose-200/80">{job.error}</div>
          <button
            onClick={() => fetch(`/api/sources/${id}`, { method: "POST" })}
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500"
          >
            Retry (keeps the transcript)
          </button>
        </div>
      ) : null}

      {source.videoPath ? (
        <video
          ref={videoRef}
          src={`/api/files/${source.videoPath}`}
          controls
          className="mt-6 w-full rounded-xl border border-slate-800"
        />
      ) : null}

      {source.clips.length > 0 ? (
        <>
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Candidates — highest scoring first
            </h2>
            <button
              onClick={() => fetch(`/api/sources/${id}`, { method: "POST" })}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
            >
              Re-rank
            </button>
          </div>

          <ul className="mt-4 grid gap-3">
            {source.clips.map((c) => (
              <li
                key={c.id}
                className={`rounded-xl border p-4 ${
                  c.status === "APPROVED"
                    ? "border-emerald-700 bg-emerald-950/20"
                    : c.status === "REJECTED"
                      ? "border-slate-800 bg-slate-900/30 opacity-50"
                      : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColor(c.score)}`}
                      >
                        {c.score}
                      </span>
                      <span className="font-semibold">{c.title || "Untitled clip"}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {fmt(c.startSeconds)} → {fmt(c.endSeconds)} ·{" "}
                      {Math.round(c.endSeconds - c.startSeconds)}s
                    </div>
                    {c.reason ? (
                      <p className="mt-2 text-xs italic text-violet-300">{c.reason}</p>
                    ) : null}
                    {c.transcriptText ? (
                      <p className="mt-2 line-clamp-3 text-xs text-slate-400">
                        “{c.transcriptText}”
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      onClick={() => preview(c)}
                      disabled={!source.videoPath}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-violet-500 disabled:opacity-30"
                    >
                      {playing === c.id ? "Playing…" : "▶ Preview"}
                    </button>
                    <button
                      onClick={() =>
                        setStatus(c.id, c.status === "APPROVED" ? "PENDING" : "APPROVED")
                      }
                      className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500"
                    >
                      {c.status === "APPROVED" ? "Approved ✓" : "Approve"}
                    </button>
                    <button
                      onClick={() =>
                        setStatus(c.id, c.status === "REJECTED" ? "PENDING" : "REJECTED")
                      }
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-rose-500"
                    >
                      {c.status === "REJECTED" ? "Rejected" : "Reject"}
                    </button>
                  </div>
                </div>

                {/* Rendering controls appear once a clip is approved. */}
                {c.status === "APPROVED" ? (
                  <div className="mt-4 border-t border-slate-800 pt-4">
                    {c.outputPath ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <video
                          src={`/api/files/${c.outputPath}`}
                          controls
                          className="max-h-[420px] rounded-lg border border-slate-800"
                        />
                        <div className="min-w-0 flex-1">
                          {c.hookText ? (
                            <div className="text-xs text-slate-400">
                              Hook:{" "}
                              <span className="font-semibold text-slate-100">
                                {c.hookText}
                              </span>
                            </div>
                          ) : null}
                          {c.postCaption ? (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">
                              {c.postCaption}
                            </p>
                          ) : null}
                          {c.hashtagsJson ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(JSON.parse(c.hashtagsJson) as string[]).map((h) => (
                                <span
                                  key={h}
                                  className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300"
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              href={`/api/files/${c.outputPath}`}
                              download
                              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold hover:bg-violet-500"
                            >
                              Download reel
                            </a>
                            <button
                              onClick={() =>
                                navigator.clipboard.writeText(
                                  `${c.postCaption ?? ""}\n\n${(JSON.parse(c.hashtagsJson || "[]") as string[]).join(" ")}`
                                )
                              }
                              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
                            >
                              Copy caption
                            </button>
                            <button
                              onClick={() => renderClip(c.id, c.layout === "card" ? "fill" : "card")}
                              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-violet-500"
                            >
                              Re-render as {c.layout === "card" ? "fill" : "card"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : c.jobs?.[0] &&
                      (c.jobs[0].state === "RUNNING" || c.jobs[0].state === "QUEUED") ? (
                      <div className="flex items-center gap-2 text-xs text-sky-300">
                        <span className="h-2 w-2 animate-ping rounded-full bg-sky-400" />
                        {c.jobs[0].step}
                      </div>
                    ) : c.jobs?.[0]?.state === "FAILED" ? (
                      <div className="text-xs text-rose-300">
                        Render failed: {c.jobs[0].error?.slice(0, 160)}
                        <button
                          onClick={() => renderClip(c.id, c.layout as "card" | "fill")}
                          className="ml-2 rounded border border-rose-700 px-2 py-0.5 hover:border-rose-500"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-400">Make a reel:</span>
                        <button
                          onClick={() => renderClip(c.id, "card")}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold hover:bg-violet-500"
                        >
                          Card layout
                        </button>
                        <button
                          onClick={() => renderClip(c.id, "fill")}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-violet-500"
                        >
                          Full-bleed
                        </button>
                        <span className="text-[11px] text-slate-500">
                          Card keeps the whole frame visible; full-bleed crops in.
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
            <strong className="text-slate-200">Next:</strong> Phase 2 turns approved
            clips into finished 9:16 reels — cut, reframed, captioned. Approve the
            ones worth keeping.
          </div>
        </>
      ) : null}
    </div>
  );
}
