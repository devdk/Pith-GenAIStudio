import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { absPath } from "../storage";

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
  const pingpong = absPath(outRel).replace(/\.mp4$/, ".pingpong.mp4");
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
    absPath(outRel),
  ]);
}

/** Replace a video's audio track with a high-quality narration file. */
export async function muxAudio(
  videoRel: string,
  audioRel: string,
  outRel: string
): Promise<void> {
  await ff([
    "-i", absPath(videoRel),
    "-i", absPath(audioRel),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    absPath(outRel),
  ]);
}
