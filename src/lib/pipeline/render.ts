import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DIR, RENDERS_DIR } from "../env";

const run = promisify(execFile);

/**
 * Remotion serves the bundle from its own local HTTP server, defaulting to port
 * 3000 — which is where the Next.js dev server lives. When both run, Remotion
 * loads the Next app instead of its bundle and fails with "not a valid Remotion
 * project". Pinning it to a dedicated port keeps the two apart.
 * Override with REMOTION_PORT if 3999 is taken.
 */
const REMOTION_PORT = process.env.REMOTION_PORT ?? "3999";

/** Render a Remotion composition via the CLI. Returns the absolute output path. */
export async function renderComposition(opts: {
  compositionId:
    | "StoryVideo"
    | "CartoonExplainer"
    | "PresenterVideo"
    | "VerticalVideo"
    | "ClipReel";
  props: unknown;
  outName: string; // file name without extension
}): Promise<string> {
  await mkdir(RENDERS_DIR, { recursive: true });
  await mkdir(PUBLIC_DIR, { recursive: true });
  const propsFile = path.join(RENDERS_DIR, `${opts.outName}.props.json`);
  await writeFile(propsFile, JSON.stringify(opts.props));
  const outFile = path.join(RENDERS_DIR, `${opts.outName}.mp4`);

  // Spawn the CLI through node directly (no shell) so paths with spaces survive.
  // (The bin file isn't in the package's `exports`, so build the path by hand.)
  const cli = path.join(
    process.cwd(),
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js"
  );
  await run(
    process.execPath,
    [
      cli, "render",
      "src/remotion/index.ts",
      opts.compositionId,
      outFile,
      `--props=${propsFile}`,
      `--public-dir=${PUBLIC_DIR}`,
      `--port=${REMOTION_PORT}`,
      "--log=error",
    ],
    { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 }
  );
  return outFile;
}
