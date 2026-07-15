/**
 * Render worker: polls the DB for queued jobs and runs them one at a time.
 * Run with: npm run worker
 * (DB-backed queue keeps local dev Redis-free; swap for BullMQ at scale.)
 */
import { prisma } from "./lib/db";
import { markFailed, runJob } from "./lib/pipeline/runJob";

const POLL_MS = 3000;

async function tick(): Promise<void> {
  const job = await prisma.job.findFirst({
    where: { state: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return;

  console.log(`[worker] starting job ${job.id}`);
  await prisma.job.update({
    where: { id: job.id },
    data: { state: "RUNNING", step: "Starting" },
  });
  try {
    await runJob(job.id);
    console.log(`[worker] job ${job.id} done`);
  } catch (err) {
    console.error(`[worker] job ${job.id} failed:`, err);
    await markFailed(job.id, err);
  }
}

async function main(): Promise<void> {
  console.log("[worker] watching for jobs…");
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
