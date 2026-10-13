"use client";

import { useEffect, useState } from "react";

type Health = {
  online: boolean;
  lastSeenSecondsAgo: number | null;
  queued: number;
};

/**
 * Warns when work is queued but nothing is running it.
 *
 * The web server accepts jobs independently of the worker, so without this a
 * job sits at "queued" indefinitely and looks like it is simply waiting its
 * turn. Stays out of the way when the worker is healthy or nothing is pending.
 */
export function WorkerBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok) setHealth(await res.json());
      } catch {
        /* transient — keep the last known state */
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (!health || health.online || health.queued === 0) return null;

  return (
    <div className="border-b border-amber-700/60 bg-amber-950/40">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-6 py-3 text-sm">
        <span className="mt-0.5 text-amber-400">⚠</span>
        <div className="text-amber-200">
          <strong>
            {health.queued} job{health.queued === 1 ? "" : "s"} waiting, but the
            worker isn&apos;t running.
          </strong>{" "}
          Nothing will process until it&apos;s started. Run{" "}
          <code className="rounded bg-amber-900/50 px-1.5 py-0.5">npm run worker</code>{" "}
          in the project folder.
          {health.lastSeenSecondsAgo !== null ? (
            <span className="ml-1 text-amber-300/70">
              Last seen {Math.round(health.lastSeenSecondsAgo / 60)} min ago.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
