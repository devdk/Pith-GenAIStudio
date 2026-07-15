import path from "node:path";

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? "./storage");
/** Files under storage/public are exposed to Remotion via --public-dir. */
export const PUBLIC_DIR = path.join(STORAGE_DIR, "public");
export const RENDERS_DIR = path.join(STORAGE_DIR, "renders");
export const ASSETS_DIR = path.join(STORAGE_DIR, "assets");

export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
export const MAGNIFIC_API_KEY = process.env.MAGNIFIC_API_KEY ?? "";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

export function requireEnv(name: string, value: string): string {
  if (!value) throw new Error(`${name} is not configured (set it in .env)`);
  return value;
}
