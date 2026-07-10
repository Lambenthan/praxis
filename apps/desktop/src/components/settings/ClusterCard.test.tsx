import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HpcCheck, HpcJob } from "@/lib/tauri";
import { ClusterCard } from "./ClusterCard";

const bridge = {
  listSshHosts: vi.fn<() => Promise<string[]>>(),
  hpcConfig: vi.fn<() => Promise<string | null>>(),
  setHpcConfig: vi.fn<(h: string | null) => Promise<void>>(),
  hpcCheck: vi.fn<(h: string) => Promise<HpcCheck>>(),
  hpcJobs: vi.fn<(h: string) => Promise<HpcJob[]>>(),
  hpcCancel: vi.fn<(h: string, id: string) => Promise<void>>(),
};

vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  listSshHosts: (...a: []) => bridge.listSshHosts(...a),
  hpcConfig: (...a: []) => bridge.hpcConfig(...a),
  setHpcConfig: (...a: [string | null]) => bridge.setHpcConfig(...a),
  hpcCheck: (...a: [string]) => bridge.hpcCheck(...a),
  hpcJobs: (...a: [string]) => bridge.hpcJobs(...a),
  hpcCancel: (...a: [string, string]) => bridge.hpcCancel(...a),
}));

const slurmOk: HpcCheck = { reachable: true, slurm: "slurm 23.11.4", message: null };
const jobs: HpcJob[] = [
  { id: "42", state: "RUNNING", time: "1:23", partition: "gpu", name: "fit-model" },
  { id: "43", state: "PENDING", time: "0:00", partition: "cpu", name: "simulate" },
];

describe("ClusterCard", () => {
  beforeEach(() => {
    Object.values(bridge).forEach((f) => f.mockReset());
    bridge.listSshHosts.mockResolvedValue(["login-a", "login-b"]);
    bridge.hpcConfig.mockResolvedValue(null);
  });

  it("connects a reachable host, saves it, and shows its queue", async () => {
    bridge.hpcCheck.mockResolvedValue(slurmOk);
    bridge.setHpcConfig.mockResolvedValue();
    bridge.hpcJobs.mockResolvedValue(jobs);
    render(<ClusterCard />);

    await userEvent.type(screen.getByRole("combobox"), "login-a");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(bridge.setHpcConfig).toHaveBeenCalledWith("login-a"));
    expect(screen.getByText("login-a")).toBeInTheDocument();
    expect(screen.getByText("slurm 23.11.4")).toBeInTheDocument();
    expect(await screen.findByText("fit-model")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
  });

  it("shows the SSH error and does not save an unreachable host", async () => {
    bridge.hpcCheck.mockResolvedValue({
      reachable: false,
      slurm: null,
      message: "Permission denied (publickey).",
    });
    render(<ClusterCard />);

    await userEvent.type(screen.getByRole("combobox"), "nowhere");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByText("Permission denied (publickey).")).toBeInTheDocument();
    expect(bridge.setHpcConfig).not.toHaveBeenCalled();
    // Still on the connect form.
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("restores a configured host on mount and can cancel a job", async () => {
    bridge.hpcConfig.mockResolvedValue("login-b");
    bridge.hpcCheck.mockResolvedValue(slurmOk);
    bridge.hpcJobs.mockResolvedValue(jobs);
    bridge.hpcCancel.mockResolvedValue();
    render(<ClusterCard />);

    expect(await screen.findByText("simulate")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel job 43" }));
    await waitFor(() => expect(bridge.hpcCancel).toHaveBeenCalledWith("login-b", "43"));
    // The queue is re-read after a cancel.
    expect(bridge.hpcJobs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows an empty-queue message and can disconnect", async () => {
    bridge.hpcConfig.mockResolvedValue("login-b");
    bridge.hpcCheck.mockResolvedValue({ reachable: true, slurm: null, message: "no sbatch" });
    bridge.hpcJobs.mockResolvedValue([]);
    bridge.setHpcConfig.mockResolvedValue();
    render(<ClusterCard />);

    expect(await screen.findByText("No jobs in the queue.")).toBeInTheDocument();
    expect(screen.getByText("no sbatch")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(bridge.setHpcConfig).toHaveBeenCalledWith(null));
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});
