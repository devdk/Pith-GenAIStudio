"use client";

import { useCallback, useEffect, useState } from "react";

type VoiceOption = { id: string; name: string; category: string; inHouse: boolean };

const input =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-500";

export default function VoicesPage() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/voices")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setVoices)
      .catch(() => setMsg({ ok: false, text: "Could not load voices — check ELEVENLABS_API_KEY." }));
  }, []);
  useEffect(load, [load]);

  async function clone() {
    if (!files?.length || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("consent", String(consent));
    for (const f of Array.from(files)) fd.append("files", f);
    const res = await fetch("/api/voices", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Voice "${json.name}" cloned — it's now available in the wizard.` });
      setName("");
      setFiles(null);
      setConsent(false);
      load();
    } else {
      setMsg({ ok: false, text: json.error ?? "Cloning failed." });
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Voices</h1>
      <p className="mt-1 text-sm text-slate-400">
        Voices on the connected ElevenLabs account, available for narration.
      </p>

      <ul className="mt-6 grid gap-2">
        {voices.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3"
          >
            <div>
              <span className="font-medium">{v.name}</span>
              <span className="ml-2 text-xs text-slate-500">{v.id}</span>
            </div>
            <span className="rounded-full bg-slate-500/15 px-3 py-1 text-xs text-slate-300">
              {v.inHouse ? "cloned in-house" : v.category}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-xl border border-violet-800/60 bg-violet-950/30 p-5">
        <h2 className="font-semibold">Clone a new voice</h2>
        <p className="mt-1 text-xs text-slate-400">
          Upload 1–3 minutes of clean speech (one speaker, no music). Uses ElevenLabs Instant
          Voice Cloning — needs a Starter plan or above on the connected account.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Voice name
            </label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="James" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Audio samples (mp3/wav/m4a)
            </label>
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => setFiles(e.target.files)}
              className="text-sm"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            I confirm the speaker has consented to their voice being cloned and used for
            generated narration.
          </label>
          <button
            onClick={clone}
            disabled={busy || !consent || !name.trim() || !files?.length}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? "Cloning…" : "Clone voice"}
          </button>
          {msg ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
              {msg.text}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
