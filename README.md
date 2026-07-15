# Mirasphere Studio

Generate branded story videos, cartoon explainers, and realistic AI-presenter
videos from a web UI. Built on Next.js + Remotion, with ElevenLabs
(narration, word-timestamps, in-house voice cloning) and Magnific/Freepik
(Kling image-to-video, Latent Sync lip-sync).

## Styles

| Style | What you get | Typical time |
|---|---|---|
| **Branded** | Dark corporate story video, beats synced to narration | 1–4 min |
| **Cartoon** | Doodle/comic look, same beats machinery | 1–4 min |
| **Presenter** | A photo becomes a lip-synced talking head in a circular frame, text beats appear word-synced beside it | 10–25 min |

## Quick start (local)

```bash
npm install
cp .env.example .env   # fill in ELEVENLABS_API_KEY + MAGNIFIC_API_KEY
npm run db:push        # create the SQLite dev database

npm run dev            # web UI on http://localhost:3000
npm run worker         # render worker (separate terminal — required)
```

Create videos at `/new`, manage narration voices (including cloning new ones
from audio samples) at `/voices`.

## How a render works

1. The wizard (or the optional AI-draft endpoint) produces a list of **beats**
   — hook, stat, problem, solution, cta, logo — each with on-screen fields and
   a `narration` chunk.
2. The worker picks up the queued job and, per style:
   - narration via ElevenLabs TTS,
   - *(presenter)* word timestamps via ElevenLabs STT → exact beat boundaries,
   - *(presenter)* Kling animates the photo → palindrome-looped to narration
     length → Latent Sync lip-syncs it → HQ audio remuxed,
   - Remotion renders the composition (`src/remotion/`).
3. Every step is checkpointed in the DB — **Retry** resumes from the last
   completed step instead of re-billing earlier API calls.

## Architecture notes

- **Queue**: DB-backed poller (`src/worker.ts`) — no Redis needed locally.
  Swap for BullMQ + Redis at scale; the seam is `runJob()`.
- **Storage**: local `./storage` dir (`src/lib/storage.ts`). Swap for S3/R2 at
  deploy; `ensurePublicUrl()` currently uses a temp file host because Latent
  Sync needs redirect-free public URLs — presigned R2 URLs replace it in prod.
- **Consent**: presenter photos and voice clones both require an explicit
  consent confirmation and it's stored with the asset.

## Deploy (planned)

Linux VPS (8GB+ RAM for headless-Chrome renders): Postgres + Redis + R2,
`next build` + worker under systemd/PM2. Remotion requires a company license
for teams >3 people — check before commercial rollout.
