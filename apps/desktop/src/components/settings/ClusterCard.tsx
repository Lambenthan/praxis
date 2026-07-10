import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import {
  hpcCancel,
  hpcCheck,
  hpcConfig,
  hpcJobs,
  isTauri,
  listSshHosts,
  setHpcConfig,
  type HpcCheck,
  type HpcJob,
} from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * Cluster (HPC) over SSH (P2-2). The app uses the user's own ssh keys/config —
 * nothing is installed on the cluster. Connecting here (a) verifies SSH + Slurm
 * and (b) records the host in the workspace's .openscience/hpc.json, where the
 * bundled hpc-slurm skill picks it up so the agent can submit batch jobs.
 * This card is also where the user watches and cancels their queued jobs.
 */
export function ClusterCard() {
  const t = useT();
  const [hosts, setHosts] = useState<string[]>([]);
  const [host, setHost] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [check, setCheck] = useState<HpcCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<HpcJob[] | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const loadJobs = useCallback(async (h: string) => {
    setLoadingJobs(true);
    try {
      setJobs(await hpcJobs(h));
    } catch (e) {
      setJobs(null);
      toast.error(`${t("Could not read the queue:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    void listSshHosts().then(setHosts).catch(() => undefined);
    void hpcConfig()
      .then((h) => {
        if (!h) return;
        setHost(h);
        void hpcCheck(h).then(setCheck).catch(() => undefined);
        void loadJobs(h);
      })
      .catch((e: unknown) => {
        // A corrupt hand-edited hpc.json must not look like "no cluster".
        toast.error(
          `${t("Could not read the cluster config (.openscience/hpc.json):")} ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
  }, [loadJobs]);

  const connect = async () => {
    const h = draft.trim();
    if (!h) return;
    setChecking(true);
    setConnectError(null);
    try {
      const c = await hpcCheck(h);
      if (!c.reachable) {
        setConnectError(c.message ?? "connection failed");
        return;
      }
      await setHpcConfig(h);
      setHost(h);
      setCheck(c);
      setDraft("");
      void loadJobs(h);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const remove = async () => {
    try {
      await setHpcConfig(null);
      setHost(null);
      setCheck(null);
      setJobs(null);
    } catch (e) {
      toast.error(`${t("Could not remove:")} ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const cancel = async (id: string) => {
    if (!host) return;
    try {
      await hpcCancel(host, id);
      toast.success(`${t("Job")} ${id} ${t("canceled")}`);
      void loadJobs(host);
    } catch (e) {
      toast.error(`${t("Could not cancel")} ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="font-serif text-[15px] text-text">{t("Cluster (HPC)")}</h2>
        <p className="mt-0.5 text-xs text-muted">
          {t("Run heavy jobs on your Slurm cluster over SSH — connect once, then just ask the agent.")}
        </p>
      </header>
      <div className="px-5 py-4">
        {!isTauri ? (
          <p className="text-[13px] text-muted">{t("Available in the desktop app.")}</p>
        ) : !host ? (
          <>
            <div className="flex items-center gap-2">
              <input
                list="ssh-hosts"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void connect()}
                placeholder={
                  hosts.length > 0
                    ? `${t("user@login.hpc.edu — or pick from your ~/.ssh/config")} (${hosts.length})`
                    : "user@login.hpc.edu"
                }
                className={inputCls("flex-1 font-mono")}
              />
              <datalist id="ssh-hosts">
                {hosts.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
              <button
                className={btnAccent()}
                onClick={() => void connect()}
                disabled={checking || !draft.trim()}
              >
                {checking ? <Loader2 size={12} className="animate-spin" /> : null}
                {checking ? t("Checking…") : t("Connect")}
              </button>
            </div>
            {connectError && <p className="mt-2 text-xs text-error">{connectError}</p>}
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              {t(
                "Uses your own SSH keys — nothing is installed on the cluster. Once connected, the agent can write and submit Slurm batch scripts for you and fetch the results back into the workspace.",
              )}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 text-[13px]">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  check?.slurm ? "bg-ok" : check ? "bg-warn" : "bg-muted",
                )}
              />
              <span className="font-mono font-medium text-text">{host}</span>
              <span className="truncate text-xs text-muted">
                {check?.slurm ?? check?.message ?? t("checking…")}
              </span>
              <div className="flex-1" />
              <button
                className="flex h-7 w-7 items-center justify-center rounded-input text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
                onClick={() => void loadJobs(host)}
                disabled={loadingJobs}
                title={t("Refresh the job queue")}
                aria-label={t("Refresh the job queue")}
              >
                <RefreshCw size={13} className={cn(loadingJobs && "animate-spin")} />
              </button>
              <button
                className="text-xs text-muted transition-colors hover:text-error"
                onClick={() => void remove()}
                title={t("Disconnect this cluster")}
              >
                {t("Remove")}
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-input border border-border">
              {jobs === null ? (
                <p className="bg-surface px-3 py-2.5 text-[13px] text-muted">
                  {loadingJobs ? t("Reading the queue…") : t("Queue unavailable.")}
                </p>
              ) : jobs.length === 0 ? (
                <p className="bg-surface px-3 py-2.5 text-[13px] text-muted">
                  {t("No jobs in the queue.")}
                </p>
              ) : (
                jobs.map((j, i) => (
                  <div
                    key={j.id}
                    className={cn(
                      "flex h-9 items-center gap-2.5 bg-surface px-3 text-[13px]",
                      i > 0 && "border-t border-border",
                    )}
                  >
                    <span className="font-mono text-xs text-muted">{j.id}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-border",
                        j.state === "RUNNING"
                          ? "text-ok"
                          : j.state === "PENDING"
                            ? "text-warn"
                            : "text-muted",
                      )}
                    >
                      {j.state}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text">{j.name}</span>
                    <span className="font-mono text-xs text-muted">{j.time}</span>
                    <span className="text-xs text-muted">{j.partition}</span>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-input text-muted transition-colors hover:bg-surface-2 hover:text-error"
                      onClick={() => void cancel(j.id)}
                      title={`${t("Cancel job")} ${j.id}`}
                      aria-label={`${t("Cancel job")} ${j.id}`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <p className="mt-2.5 text-xs text-muted">
              {t(
                "Ask the agent to run an analysis on the cluster — it submits batch scripts here and pulls results back into the workspace.",
              )}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

const inputCls = (extra = "") =>
  cn(
    "h-9 rounded-input border border-border bg-surface px-3 text-[13px] text-text outline-none",
    "placeholder:text-muted focus:border-accent/60",
    extra,
  );

const btnAccent = (extra = "") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] font-medium",
    "text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50",
    extra,
  );
