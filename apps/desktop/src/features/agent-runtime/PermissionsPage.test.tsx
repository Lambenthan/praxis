import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionAskedEvent } from "@fishes/sdk";
import { useRuntimeStore } from "@/lib/runtime";
import { PermissionsPage } from "./PermissionsPage";
import { usePermissionLog } from "./permissionLog";

const perm: PermissionAskedEvent = {
  type: "permission.asked",
  sessionId: "ses_1",
  requestId: "per_1",
  action: "bash",
  resources: ["rm -rf build/"],
};

beforeEach(() => {
  usePermissionLog.setState({ decisions: [] });
  useRuntimeStore.setState({
    permissions: [],
    approvalMode: "approve",
    status: "ready",
    replyPermission: async () => {},
  });
});

describe("PermissionsPage — pending requests", () => {
  it("shows a pending request's action and resources and answers it once", async () => {
    const replyPermission = vi.fn(async () => {});
    useRuntimeStore.setState({ permissions: [perm], replyPermission });

    render(<PermissionsPage />);
    expect(screen.getByText("rm -rf build/")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(replyPermission).toHaveBeenCalledWith("per_1", "once");

    // The decision is recorded to the in-session audit log.
    const decisions = usePermissionLog.getState().decisions;
    expect(decisions).toHaveLength(1);
    expect(decisions[0].reply).toBe("once");
    expect(decisions[0].action).toBe("bash");
  });

  it("replies always and reject through the real store method", async () => {
    const replyPermission = vi.fn(async () => {});
    useRuntimeStore.setState({ permissions: [perm], replyPermission });

    render(<PermissionsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(replyPermission).toHaveBeenLastCalledWith("per_1", "always");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(replyPermission).toHaveBeenLastCalledWith("per_1", "reject");
  });
});

describe("PermissionsPage — empty and mode states", () => {
  it("prompts to connect when the runtime is offline", () => {
    useRuntimeStore.setState({ permissions: [], status: "offline" });
    render(<PermissionsPage />);
    expect(screen.getByText(/Connect the runtime to see and answer/i)).toBeInTheDocument();
  });

  it("shows a clear empty state when connected with nothing pending", () => {
    useRuntimeStore.setState({ permissions: [], status: "ready", approvalMode: "approve" });
    render(<PermissionsPage />);
    expect(screen.getByText(/No pending requests/i)).toBeInTheDocument();
  });

  it("explains full-access mode when it is on", () => {
    useRuntimeStore.setState({ permissions: [], status: "ready", approvalMode: "full" });
    render(<PermissionsPage />);
    expect(screen.getByText(/Approval mode: Full access/i)).toBeInTheDocument();
  });
});
