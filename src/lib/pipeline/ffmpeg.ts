import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import { absPath, ensureAbsPath } from "../storage";

const run = promisify(execFile);

async function ff(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");
  await run(ffmpegPath, ["-y", "-loglevel", "error", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Extend a short clip to `targetSeconds` with a palindrome loop
 * (forward-reverse-forward…) so there are no jump cuts.
 */
export async function palindromeLoop(
  inRel: string,
  outRel: string,
  targetSeconds: number
): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  const pingpong = outAbs.replace(/\.mp4$/, ".pingpong.mp4");
  await ff([
    "-i", absPath(inRel),
    "-filter_complex", "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]",
    "-map", "[v]",
    "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
    pingpong,
  ]);
  // A single ping-pong is ~2x the source; loop it enough times to cover target.
  await ff([
    "-stream_loop", "8",
    "-i", pingpong,
    "-t", String(targetSeconds),
    "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
    outAbs,
  ]);
}

/**
 * Duration of a media file in seconds, via ffmpeg. Robust across containers
 * where header-parsing libraries disagree. `ffmpeg -i` with no output exits
 * non-zero by design and prints the info to stderr, so we parse that.
 */
export async function probeDurationSeconds(relPath: string): Promise<number> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");
  let stderr = "";
  try {
    await run(ffmpegPath, ["-i", absPath(relPath), "-hide_banner"], {
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? "";
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) throw new Error(`could not read duration from ffmpeg output for ${relPath}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Crop-to-fill a clip to 1080x1920 (9:16) and trim/loop it to `targetSeconds`.
 * Scales so the shorter side covers the frame, then centre-crops — the standard
 * "fill the reel, don't letterbox" transform. Audio is dropped; b-roll is muted.
 */
export async function prepareVerticalBackground(
  inRel: string,
  outRel: string,
  targetSeconds: number
): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  await ff([
    "-stream_loop", "-1", // loop input as many times as needed
    "-i", absPath(inRel),
    "-t", String(targetSeconds),
    "-an",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
    outAbs,
  ]);
}

/**
 * Fit a clip to exactly `seconds`, normalised to 1080x1920/30fps.
 * Short clips are looped, long clips trimmed. Audio dropped.
 */
export async function fitClipToDuration(
  inRel: string,
  outRel: string,
  seconds: number
): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  await ff([
    "-stream_loop", "-1",
    "-i", absPath(inRel),
    "-t", String(Math.max(0.2, seconds)),
    "-an",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1",
    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
    outAbs,
  ]);
}

/**
 * Concatenate pre-normalised clips into one track. Uses the concat demuxer with
 * re-encoding, which tolerates small parameter differences between clips.
 */
export async function concatVideos(inRels: string[], outRel: string): Promise<void> {
  if (inRels.length === 0) throw new Error("concatVideos: no inputs");
  const outAbs = await ensureAbsPath(outRel);
  const listRel = outRel.replace(/\.mp4$/, ".concat.txt");
  const listAbs = await ensureAbsPath(listRel);
  // The demuxer needs forward slashes and escaped quotes, even on Windows.
  const body = inRels
    .map((r) => `file '${absPath(r).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listAbs, body, "utf8");
  await ff([
    "-f", "concat", "-safe", "0",
    "-i", listAbs,
    "-an",
    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
    "-vf", "fps=30,setsar=1",
    outAbs,
  ]);
}

/**
 * Cut an exact range out of a longer video.
 *
 * `-ss` is placed after `-i` so the seek is frame-accurate rather than snapping
 * to the nearest keyframe — a keyframe seek can be a second out, which clips the
 * first word off the hook. That costs a decode pass, which is why the stream is
 * re-encoded rather than copied.
 *
 * Audio is loudness-normalised to roughly broadcast level so clips from
 * different sources don't jump in volume between posts.
 */
export async function cutRange(
  inRel: string,
  outRel: string,
  startSeconds: number,
  endSeconds: number
): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  const duration = Math.max(0.2, endSeconds - startSeconds);
  await ff([
    "-i", absPath(inRel),
    "-ss", startSeconds.toFixed(3),
    "-t", duration.toFixed(3),
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    outAbs,
  ]);
}

/** Grab a single frame as a JPEG cover/thumbnail. */
export async function extractCoverFrame(
  videoRel: string,
  outRel: string,
  atSeconds = 1
): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  await ff([
    "-ss", String(atSeconds),
    "-i", absPath(videoRel),
    "-frames:v", "1",
    "-q:v", "3",
    outAbs,
  ]);
}

/** Extract mono 44.1kHz mp3 audio from any media file (for transcription). */
export async function extractAudio(inRel: string, outRel: string): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  await ff([
    "-i", absPath(inRel),
    "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k",
    outAbs,
  ]);
}

/** Replace a video's audio track with a high-quality narration file. */
export async function muxAudio(
  videoRel: string,
  audioRel: string,
  outRel: string
): Promise<void> {
  const outAbs = await ensureAbsPath(outRel);
  await ff([
    "-i", absPath(videoRel),
    "-i", absPath(audioRel),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    outAbs,
  ]);
}
