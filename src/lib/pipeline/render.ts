import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DIR, RENDERS_DIR } from "../env";

const run = promisify(execFile);

/** Render a Remotion composition via the CLI. Returns the absolute output path. */
export async function renderComposition(opts: {
  compositionId: "StoryVideo" | "CartoonExplainer" | "PresenterVideo";
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
      "--log=error",
    ],
    { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 }
  );
  return outFile;
}
