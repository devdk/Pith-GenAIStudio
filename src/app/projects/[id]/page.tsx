"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  state: string;
  step: string;
  error?: string | null;
  outputPath?: string | null;
  coverPath?: string | null;
  postCaption?: string | null;
  hashtagsJson?: string | null;
  createdAt: string;
};
type Project = {
  id: string;
  name: string;
  style: string;
  silent: boolean;
  createdAt: string;
  jobs: Job[];
};

const STEPS_HINT: Record<string, string> = {
  PRESENTER:
    "Voiceover → timestamp alignment → photo animation (Kling) → lip-sync → final render. Expect 10–25 minutes.",
  BRANDED: "Voiceover → render. Usually 1–4 minutes.",
  CARTOON: "Voiceover → render. Usually 1–4 minutes.",
  BROLL: "Voiceover → caption timing → background prep → render. Usually 2–5 minutes.",
  COMMENTARY:
    "Voiceover → caption timing → background prep → photo animation → lip-sync → render. Expect 10–25 minutes.",
  SPLIT:
    "Voiceover → caption timing → background prep → photo animation → lip-sync → render. Expect 10–25 minutes.",
};

const VERTICAL = ["COMMENTARY", "BROLL", "SPLIT"];

/** Small copy-to-clipboard button with transient confirmation. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/** Free-text "change this" box shown once a video is finished. */
function RefinePanel({ id, onQueued }: { id: string; onQueued: () => void }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examples = [
    "Make the hook punchier",
    "Drop the stat beat",
    "Add a beat about our 30-day guarantee",
    "Change the CTA to 'Get a free audit'",
    "Make the whole thing shorter and snappier",
  ];

  async function submit() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "refine failed");
      setNote(
        `${json.changeNote}${
          json.reusedVoiceover
            ? " Narration unchanged — reusing the existing voiceover and presenter clip."
            : " Narration changed — regenerating the voiceover."
        }`
      );
      setInstruction("");
      onQueued();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-violet-800/60 bg-violet-950/30 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
        Refine this video
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Describe the change in plain English. Unchanged parts are reused, so you
        only pay for what actually changes.
      </p>
      <textarea
        className="mt-3 h-20 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-500"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="e.g. Make the hook punchier and swap the CTA for 'Book a free audit'"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => setInstruction(ex)}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-violet-500"
          >
            {ex}
          </button>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={busy || !instruction.trim()}
        className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
      >
        {busy ? "Applying…" : "Apply & re-render"}
      </button>
      {note ? (
        <div className="mt-3 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {note}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
      if (res.ok && !stop) setProject(await res.json());
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, reloadKey]);

  if (!project) return <div className="text-slate-400">Loading…</div>;

  const job = project.jobs[0];
  const done = job?.state === "DONE" && job.outputPath;

  return (
    <div className="max-w-3xl">
      <Link href="/" className="text-sm text-slate-400 hover:text-white">← All videos</Link>
      <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
      <div className="mt-1 text-sm text-slate-400">
        {project.style.toLowerCase()} · {new Date(project.createdAt).toLocaleString("en-GB")}
      </div>

      {done ? (
        <div className="mt-6">
          <video
            src={`/api/files/${job.outputPath}`}
            controls
            className={`rounded-xl border border-slate-800 ${
              VERTICAL.includes(project.style) ? "max-h-[70vh]" : "w-full max-w-xl"
            }`}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={`/api/files/${job.outputPath}`}
              download={`${project.name.replace(/[^A-Za-z0-9._-]+/g, "-")}.mp4`}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
            >
              Download MP4
            </a>
            {job.coverPath ? (
              <a
                href={`/api/files/${job.coverPath}`}
                download={`${project.name.replace(/[^A-Za-z0-9._-]+/g, "-")}-cover.jpg`}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500"
              >
                Download cover
              </a>
            ) : null}
          </div>

          {/* Ready-to-post caption + hashtags */}
          {job.postCaption ? (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Ready to post
                </h2>
                <CopyButton
                  text={`${job.postCaption}\n\n${(JSON.parse(job.hashtagsJson || "[]") as string[]).join(" ")}`}
                  label="Copy caption + tags"
                />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">
                {job.postCaption}
              </p>
              {job.hashtagsJson ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(JSON.parse(job.hashtagsJson) as string[]).map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-300"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <RefinePanel id={id} onQueued={() => setReloadKey((k) => k + 1)} />
        </div>
      ) : job?.state === "FAILED" ? (
        <div className="mt-6 rounded-xl border border-rose-900 bg-rose-950/40 p-5">
          <div className="font-semibold text-rose-300">Render failed</div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-rose-200/80">{job.error}</div>
          <button
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              await fetch(`/api/projects/${id}`, { method: "POST" });
              setRetrying(false);
            }}
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500 disabled:opacity-40"
          >
            Retry (resumes from last completed step)
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-ping rounded-full bg-sky-400" />
            <span className="font-medium">{job?.step ?? "Queued"}</span>
          </div>
          <p className="mt-3 text-sm text-slate-400">{STEPS_HINT[project.style]}</p>
          <p className="mt-1 text-xs text-slate-500">
            This page refreshes automatically. Make sure the worker is running
            (<code className="rounded bg-slate-800 px-1">npm run worker</code>).
          </p>
        </div>
      )}
    </div>
  );
}
