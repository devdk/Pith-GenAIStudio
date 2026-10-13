# Pith Studio

*The essential part, and the shortest way to say it.*

Generate branded story videos, cartoon explainers, AI-presenter videos and
9:16 reels from a web UI, and mine ready-to-post clips out of long podcasts.
Built on Next.js + Remotion, with ElevenLabs (narration, word timestamps,
in-house voice cloning), Magnific/Freepik (Kling video generation, Latent Sync
lip-sync) and Claude (scripting, art direction, clip selection).

## What it makes

### Square 1:1 — feed posts

| Style | What you get | Typical time |
|---|---|---|
| **Branded** | Dark corporate story video, beats synced to narration | 1–4 min |
| **Cartoon** | Doodle/comic look, same beats machinery | 1–4 min |
| **Presenter** | A photo becomes a lip-synced talking head, text beats word-synced beside it | 10–25 min |

### Vertical 9:16 — Reels / TikTok / Shorts

| Style | What you get |
|---|---|
| **Commentary** | AI background + presenter face-cam + word-synced captions |
| **Captioned b-roll** | AI background + captions, no face (fastest) |
| **Split-screen** | Presenter on top, background below |

Backgrounds are **generated per beat** so the visuals cut when the topic cuts —
see `src/lib/pipeline/models.ts` for the model registry (Kling 3 can cover a
whole reel in one multi-shot generation).

### Clip finder — long video → short clips

Point `/clips` at a podcast or talk. It downloads, transcribes, and ranks the
stretches that stand alone as shorts; you review the picks, approve the good
ones, and render each into a captioned 9:16 reel with a hook and caption.

## Quick start (local)

```bash
npm install
cp .env.example .env   # ELEVENLABS_API_KEY, MAGNIFIC_API_KEY, ANTHROPIC_API_KEY
npm run db:push        # create the SQLite dev database

npm run dev            # web UI on http://localhost:3000
npm run worker         # render worker (separate terminal — REQUIRED)
```

**Both processes must run.** The web server accepts jobs; the worker executes
them. With the worker down, jobs queue forever — the UI shows a warning banner
when that happens.

### yt-dlp (only needed for the clip finder)

The binary is not committed (platform-specific, ~18MB, self-updating):

```bash
mkdir -p bin
curl -L -o bin/yt-dlp.exe https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe   # Windows
# macOS/Linux: .../download/yt-dlp  and chmod +x
```

**Keep it current.** YouTube changes delivery every few months and stale
versions fail with HTTP 403. Fix: `./bin/yt-dlp.exe -U`.

## How a render works

1. The wizard (or AI draft / URL remix) produces a list of **beats** — hook,
   stat, problem, solution, cta, logo — each with on-screen fields and a
   `narration` chunk.
2. The worker picks up the queued job and, per style:
   - narration via ElevenLabs TTS,
   - word timestamps via ElevenLabs STT → exact beat boundaries and captions,
   - *(presenter)* Kling animates the photo → looped → Latent Sync → HQ audio,
   - *(reels)* a background clip per beat, cached by prompt hash,
   - Remotion renders the composition (`src/remotion/`).
3. Every step is checkpointed — **Retry** resumes from the last completed step
   instead of re-paying for earlier API calls.

## Architecture notes

- **Jobs are polymorphic** (`RENDER` | `HARVEST` | `CLIP`) and share one worker,
  queue, checkpointing and stale-job recovery.
- **Queue**: DB-backed poller (`src/worker.ts`) — no Redis locally. A worker
  that dies mid-job is detected and its job requeued on the next startup.
- **Storage**: local `./storage` (`src/lib/storage.ts`). Swap for S3/R2 at
  deploy; `ensurePublicUrl()` uses a temp file host because Latent Sync needs
  redirect-free public URLs — presigned R2 URLs replace it in prod.
- **Captions use the authored text**, timed by the transcript. STT mishears
  brand names ("Swann" → "Swan"); burning that into a client's ad is not an
  option, so `alignNarration()` keeps our spelling and borrows only the timing.
- **LLM calls use structured outputs** (`output_config.format`) so replies are
  schema-valid JSON rather than prose we parse hopefully.
- **Consent**: presenter photos and voice clones both require explicit
  confirmation, stored with the asset.

## Known trade-offs

- **Clip rendering is slow** — Remotion screenshots headless Chrome frame by
  frame, so a 55s clip takes ~15 min on a laptop CPU. Fine for generated
  formats where every pixel is synthetic; wasteful for "burn captions onto
  existing footage". An ffmpeg fast path would cut this to under a minute.
- **Remotion licensing**: free for individuals and companies of 3 or fewer;
  larger teams need a company licence. Check before commercial rollout.

## Deploy (planned)

Linux VPS (8GB+ RAM for headless-Chrome renders): Postgres + Redis + R2,
`next build` + worker under systemd/PM2.
