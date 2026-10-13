import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "./env";

const HEARTBEAT_FILE = path.join(STORAGE_DIR, "worker-heartbeat.json");

/**
 * How long after its last beat a worker is presumed dead. Generous enough to
 * survive a slow tick, tight enough that a crashed worker surfaces quickly.
 */
export const STALE_AFTER_MS = 30_000;

type Beat = { at: number; pid: number };

/** Called by the worker on every poll so the UI can tell it is alive. */
export async function beat(): Promise<void> {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    const payload: Beat = { at: Date.now(), pid: process.pid };
    await writeFile(HEARTBEAT_FILE, JSON.stringify(payload), "utf8");
  } catch {
    // A failed heartbeat must never take the worker down.
  }
}

export type WorkerHealth = {
  online: boolean;
  lastSeenSecondsAgo: number | null;
  /** True when liveness was inferred from job progress rather than a heartbeat. */
  inferred: boolean;
};

/**
 * Report whether a worker is actually consuming the queue.
 *
 * Without this the UI cannot distinguish "waiting its turn" from "nothing is
 * listening" — a job sits at "queued" looking healthy while no worker exists.
 *
 * `recentJobActivityAt` lets liveness be inferred from a job that is visibly
 * progressing, which keeps the check honest for a worker started before
 * heartbeats existed.
 */
export async function readWorkerHealth(
  recentJobActivityAt?: Date | null
): Promise<WorkerHealth> {
  let at: number | null = null;
  try {
    const raw = await readFile(HEARTBEAT_FILE, "utf8");
    at = (JSON.parse(raw) as Beat).at ?? null;
  } catch {
    at = null;
  }

  const activityAt = recentJobActivityAt ? new Date(recentJobActivityAt).getTime() : null;
  const newest = Math.max(at ?? 0, activityAt ?? 0);
  if (!newest) return { online: false, lastSeenSecondsAgo: null, inferred: false };

  const age = Date.now() - newest;
  return {
    online: age < STALE_AFTER_MS,
    lastSeenSecondsAgo: Math.round(age / 1000),
    inferred: at === null || (activityAt ?? 0) > at,
  };
}
