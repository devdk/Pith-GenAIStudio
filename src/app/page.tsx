import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const stateStyles: Record<string, string> = {
  DONE: "bg-emerald-500/15 text-emerald-300",
  RUNNING: "bg-sky-500/15 text-sky-300 animate-pulse",
  QUEUED: "bg-slate-500/15 text-slate-300",
  FAILED: "bg-rose-500/15 text-rose-300",
};

export default async function Dashboard() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Videos</h1>
        <Link
          href="/new"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
        >
          + New video
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-16 text-center text-slate-400">
          <p className="text-lg">No videos yet.</p>
          <p className="mt-2 text-sm">
            Create your first one — branded, cartoon, or an AI presenter.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {projects.map((p) => {
            const job = p.jobs[0];
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-slate-600"
                >
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {p.style.toLowerCase()} ·{" "}
                      {new Date(p.createdAt).toLocaleString("en-GB")}
                    </div>
                  </div>
                  {job ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${stateStyles[job.state] ?? ""}`}
                    >
                      {job.state === "RUNNING" ? job.step : job.state.toLowerCase()}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
