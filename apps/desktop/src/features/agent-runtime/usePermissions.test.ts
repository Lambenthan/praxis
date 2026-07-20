import { beforeEach, describe, expect, it } from "vitest";
import type { PermissionAskedEvent } from "@fishes/sdk";
import { groupPermissions } from "./usePermissions";
import { usePermissionLog } from "./permissionLog";

const mk = (
  id: string,
  action: string,
  resources: string[],
  sessionId = "ses_1",
): PermissionAskedEvent => ({
  type: "permission.asked",
  sessionId,
  requestId: id,
  action,
  resources,
});

describe("groupPermissions", () => {
  it("folds identical asks into one group with a count and a representative id", () => {
    const groups = groupPermissions([
      mk("a", "read", ["/w/data"]),
      mk("b", "read", ["/w/data"]),
      mk("c", "bash", ["ls"]),
    ]);
    expect(groups).toHaveLength(2);
    const read = groups.find((g) => g.action === "read");
    expect(read?.count).toBe(2);
    // Answering the representative answers the whole batch in the store.
    expect(read?.representativeId).toBe("a");
  });

  it("keeps identical actions from different sessions separate", () => {
    const groups = groupPermissions([
      mk("a", "read", ["/w"], "ses_1"),
      mk("b", "read", ["/w"], "ses_2"),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("permissionLog", () => {
  beforeEach(() => usePermissionLog.setState({ decisions: [] }));

  it("records decisions newest-first with a timestamp", () => {
    const { record } = usePermissionLog.getState();
    record({ action: "bash", resources: ["ls"], reply: "once", sessionId: "ses_1" });
    record({ action: "write", resources: ["a.txt"], reply: "reject", sessionId: "ses_1" });
    const d = usePermissionLog.getState().decisions;
    expect(d).toHaveLength(2);
    expect(d[0].action).toBe("write");
    expect(d[0].reply).toBe("reject");
    expect(typeof d[0].at).toBe("number");
  });

  it("clears the log", () => {
    usePermissionLog.getState().record({ action: "bash", resources: [], reply: "once", sessionId: "s" });
    usePermissionLog.getState().clear();
    expect(usePermissionLog.getState().decisions).toHaveLength(0);
  });
});
