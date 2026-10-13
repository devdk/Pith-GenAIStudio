/**
 * Render worker: polls the DB for queued jobs and runs them one at a time.
 * Run with: npm run worker
 * (DB-backed queue keeps local dev Redis-free; swap for BullMQ at scale.)
 */
import { prisma } from "./lib/db";
import { markFailed, runJob } from "./lib/pipeline/runJob";
import { runHarvest } from "./lib/pipeline/harvest";
import { runClipRender } from "./lib/pipeline/renderClip";
import { beat } from "./lib/workerHealth";

const POLL_MS = 3000;

/**
 * A job left in RUNNING with no worker behind it (process killed, machine
 * rebooted, render hung) would otherwise sit there forever, because the poller
 * only claims QUEUED work. Anything untouched for this long is requeued —
 * checkpoints mean it resumes rather than restarting from scratch.
 *
 * Must exceed the longest gap between step updates; the slowest single step is
 * lip-sync at up to ~25 minutes.
 */
const STALE_AFTER_MS = 35 * 60 * 1000;

/** Requeue jobs whose worker vanished. Called at startup and each tick. */
async function requeueStale(startup: boolean): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await prisma.job.findMany({
    where: {
      state: "RUNNING",
      // At startup nothing can legitimately be RUNNING: this process is the
      // only worker, and it has just begun. Otherwise use the staleness clock.
      ...(startup ? {} : { updatedAt: { lt: cutoff } }),
    },
  });
  for (const job of stale) {
    console.warn(
      `[worker] requeueing abandoned job ${job.id} (was "${job.step}", ` +
        `last update ${new Date(job.updatedAt).toISOString()})`
    );
    await prisma.job.update({
      where: { id: job.id },
      data: { state: "QUEUED", step: "Requeued after interruption" },
    });
  }
}

async function tick(): Promise<void> {
  const job = await prisma.job.findFirst({
    where: { state: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) {
    await requeueStale(false);
    return;
  }

  console.log(`[worker] starting ${job.kind.toLowerCase()} job ${job.id}`);
  await prisma.job.update({
    where: { id: job.id },
    data: { state: "RUNNING", step: "Starting" },
  });
  try {
    if (job.kind === "HARVEST") {
      await runHarvest(job.id);
    } else if (job.kind === "CLIP") {
      await runClipRender(job.id);
    } else {
      await runJob(job.id);
    }
    console.log(`[worker] job ${job.id} done`);
  } catch (err) {
    console.error(`[worker] job ${job.id} failed:`, err);
    await markFailed(job.id, err);
  }
}

async function main(): Promise<void> {
  await requeueStale(true);
  console.log("[worker] watching for jobs…");
  // The heartbeat runs on its own timer, not inside the loop: a single job can
  // occupy tick() for half an hour (a long download, then transcription), and a
  // beat tied to the loop would go silent for all of it and read as a crash.
  const heartbeat = setInterval(() => void beat(), 10_000);
  heartbeat.unref();
  await beat();

  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] tick error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
