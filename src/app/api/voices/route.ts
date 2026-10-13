import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ELEVENLABS_API_KEY, requireEnv } from "@/lib/env";

/** Voices available to render with: the ElevenLabs account's voices. */
export async function GET() {
  const key = requireEnv("ELEVENLABS_API_KEY", ELEVENLABS_API_KEY);
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `ElevenLabs ${res.status}: ${await res.text()}` },
      { status: 502 }
    );
  }
  const json = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; category?: string }>;
  };
  const registry = await prisma.voice.findMany();
  const cloned = new Set(registry.map((v) => v.id));
  const voices = (json.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category ?? "premade",
    inHouse: cloned.has(v.voice_id),
  }));
  return NextResponse.json(voices);
}

/**
 * In-house voice cloning: multipart form with `name`, `consent=true` and one
 * or more audio `files`. Forwards to ElevenLabs Instant Voice Cloning
 * (POST /v1/voices/add) — requires a Starter+ ElevenLabs plan.
 */
export async function POST(req: NextRequest) {
  const key = requireEnv("ELEVENLABS_API_KEY", ELEVENLABS_API_KEY);
  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim();
  const consent = form.get("consent") === "true";
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!consent) {
    return NextResponse.json(
      { error: "You must confirm you have the speaker's consent to clone their voice." },
      { status: 400 }
    );
  }
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one audio sample (1–3 minutes total works best)." },
      { status: 400 }
    );
  }

  const out = new FormData();
  out.append("name", name);
  out.append(
    "description",
    `Cloned in-house via Pith Studio on ${new Date().toISOString().slice(0, 10)}`
  );
  for (const f of files) out.append("files", f, f.name);

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: out,
  });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `ElevenLabs ${res.status}: ${text.slice(0, 400)}` },
      { status: 502 }
    );
  }
  const { voice_id } = JSON.parse(text) as { voice_id: string };
  await prisma.voice.create({ data: { id: voice_id, name, source: "CLONED" } });
  return NextResponse.json({ id: voice_id, name }, { status: 201 });
}
