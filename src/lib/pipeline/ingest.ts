import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { STORAGE_DIR } from "../env";
import { ensureAbsPath } from "../storage";

const run = promisify(execFile);

/**
 * Locate the yt-dlp binary: explicit env var, then the repo-local bin/, then
 * whatever is on PATH.
 */
function ytdlpPath(): string {
  const fromEnv = process.env.YTDLP_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const local = path.join(
    process.cwd(),
    "bin",
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );
  if (existsSync(local)) return local;
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

export type SourcePost = {
  url: string;
  platform: string;
  title?: string;
  description?: string;
  uploader?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  hashtags: string[];
  /** Storage-relative path to the downloaded media, when audio was fetched. */
  mediaRelPath?: string;
};

const SUPPORTED = /(?:instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|x\.com|twitter\.com)/i;

export function isSupportedSocialUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SUPPORTED.test(u.hostname);
  } catch {
    return false;
  }
}

function platformOf(url: string): string {
  const h = new URL(url).hostname.replace(/^www\./, "");
  if (h.includes("instagram")) return "instagram";
  if (h.includes("tiktok")) return "tiktok";
  if (h.includes("youtu")) return "youtube";
  if (h.includes("facebook")) return "facebook";
  if (h.includes("x.com") || h.includes("twitter")) return "x";
  return h;
}

/** Read public metadata (caption, author, stats) for a post — no download. */
export async function fetchPostMetadata(url: string): Promise<SourcePost> {
  if (!isSupportedSocialUrl(url)) {
    throw new Error("Unsupported URL. Use an Instagram, TikTok, YouTube, Facebook or X link.");
  }
  const { stdout } = await run(
    ytdlpPath(),
    ["--dump-single-json", "--no-warnings", "--no-playlist", url],
    { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }
  );
  const j = JSON.parse(stdout) as Record<string, unknown>;
  const description = (j.description as string) ?? "";
  return {
    url,
    platform: platformOf(url),
    title: (j.title as string) ?? undefined,
    description,
    uploader: (j.uploader as string) ?? (j.channel as string) ?? undefined,
    durationSeconds: (j.duration as number) ?? undefined,
    viewCount: (j.view_count as number) ?? undefined,
    likeCount: (j.like_count as number) ?? undefined,
    hashtags: Array.from(new Set(description.match(/#[\w]+/g) ?? [])),
  };
}

/**
 * Download a long-form source video for clip mining.
 *
 * Capped at 1080p: reframing crops into the source, so resolution directly
 * limits output quality, but uncapped 4K podcasts are gigabytes for no gain.
 */
export async function fetchSourceVideo(
  url: string,
  fileBase: string,
  onProgress?: (pct: string) => void
): Promise<{ relPath: string; title?: string; durationSeconds?: number }> {
  if (!isSupportedSocialUrl(url) && !/^https:\/\//i.test(url)) {
    throw new Error("Provide a public https video URL (YouTube, Vimeo, podcast host…).");
  }
  const meta = await fetchPostMetadata(url).catch(() => null);

  const outRel = `sources/${fileBase}.%(ext)s`;
  const outAbs = await ensureAbsPath(outRel);

  // yt-dlp downloads video and audio as separate streams and needs ffmpeg to
  // merge them. Ours isn't on PATH, so point at the bundled binary — without
  // this it silently leaves two format-tagged files and no merged output.
  const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : undefined;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ytdlpPath(),
      [
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best",
        "--merge-output-format", "mp4",
        ...(ffmpegDir ? ["--ffmpeg-location", ffmpegDir] : []),
        "--no-warnings", "--no-playlist",
        "-o", outAbs,
        url,
      ],
      { windowsHide: true }
    );
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      const m = /\[download\]\s+([\d.]+)%/.exec(b.toString());
      if (m && onProgress) onProgress(m[1]);
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      // YouTube periodically changes its delivery and breaks extraction; the
      // fix is almost always a newer yt-dlp, so say so instead of surfacing a
      // bare 403.
      const stale = /403|forbidden|unable to download video data|sign in to confirm/i.test(
        stderr
      );
      reject(
        new Error(
          `yt-dlp exited ${code}: ${stderr.slice(-400)}` +
            (stale
              ? `\n\nThis usually means yt-dlp is out of date. Update it with:  ./bin/yt-dlp.exe -U`
              : "")
        )
      );
    });
  });

  const dir = path.join(STORAGE_DIR, "sources");
  const files = await readdir(dir);
  // Take the merged output only. yt-dlp leaves per-stream intermediates named
  // `<base>.f616.mp4` / `<base>.f140.m4a`; those have a single track and would
  // fail downstream, so anything carrying a format tag is excluded.
  const isMerged = (f: string) =>
    f.startsWith(`${fileBase}.`) &&
    !/\.f\d+\./i.test(f) &&
    /\.(mp4|mkv|webm)$/i.test(f);
  const match = files.find(isMerged);
  if (!match) {
    const leftovers = files.filter((f) => f.startsWith(fileBase)).join(", ") || "none";
    throw new Error(
      `video download produced no merged file (found: ${leftovers}). ` +
        `This usually means ffmpeg wasn't available to yt-dlp for muxing.`
    );
  }

  return {
    relPath: `sources/${match}`,
    title: meta?.title,
    durationSeconds: meta?.durationSeconds,
  };
}

/**
 * Download only the audio track of a post, for transcription.
 *
 * We deliberately fetch audio (not video): the goal is to recover the spoken
 * script so we can regenerate an original video in the same style. The source
 * footage is never republished.
 */
export async function fetchPostAudio(url: string, fileBase: string): Promise<string> {
  const outRel = `work/${fileBase}.%(ext)s`;
  const outAbs = await ensureAbsPath(outRel);
  await run(
    ytdlpPath(),
    [
      "-f", "bestaudio/best",
      "-x", "--audio-format", "mp3", "--audio-quality", "5",
      "--no-warnings", "--no-playlist",
      "-o", outAbs,
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 }
  );

  // yt-dlp expands the %(ext)s template, so find what it actually wrote.
  const dir = path.join(STORAGE_DIR, "work");
  const files = await readdir(dir);
  const match = files.find((f) => f.startsWith(fileBase) && /\.(mp3|m4a|webm|opus)$/i.test(f));
  if (!match) throw new Error("audio download produced no file");
  return `work/${match}`;
}
