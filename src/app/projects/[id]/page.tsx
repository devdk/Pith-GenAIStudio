"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  state: string;
  step: string;
  error?: string | null;
  outputPath?: string | null;
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
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [retrying, setRetrying] = useState(false);

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
  }, [id]);

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
            className="w-full max-w-xl rounded-xl border border-slate-800"
          />
          <a
            href={`/api/files/${job.outputPath}`}
            download={`${project.name.replace(/[^A-Za-z0-9._-]+/g, "-")}.mp4`}
            className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
          >
            Download MP4
          </a>
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
