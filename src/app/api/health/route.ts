import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readWorkerHealth } from "@/lib/workerHealth";

export const dynamic = "force-dynamic";

/**
 * Is anything actually consuming the queue?
 *
 * The web server and the worker are separate processes, so the UI can accept a
 * job while nothing is running it. This lets the UI say so instead of showing
 * an indefinite "queued".
 */
export async function GET() {
  const [running, queuedCount] = await Promise.all([
    prisma.job.findFirst({
      where: { state: "RUNNING" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.job.count({ where: { state: "QUEUED" } }),
  ]);

  const health = await readWorkerHealth(running?.updatedAt ?? null);
  return NextResponse.json({ ...health, queued: queuedCount });
}
