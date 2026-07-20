import { useMemo } from "react";
import type { PermissionAskedEvent, PermissionReply } from "@fishes/sdk";
import { useRuntimeStore } from "@/lib/runtime";
import { usePermissionLog } from "./permissionLog";

/**
 * A deduped pending permission request. OpenCode can fire several identical
 * asks at once (e.g. three parallel reads into one folder); the runtime store
 * already answers them as a batch, so this UI presents them as one row too.
 */
export interface PendingGroup {
  /** Stable signature key: sessionId|action|resources. */
  key: string;
  /** One requestId that stands in for the whole batch — answering it answers
   *  all identical asks (the store filters by signature). */
  representativeId: string;
  action: string;
  resources: string[];
  sessionId: string;
  /** How many identical asks are folded into this row. */
  count: number;
}

const sig = (p: PermissionAskedEvent) => `${p.sessionId}|${p.action}|${p.resources.join("|")}`;

/** Fold identical pending asks into one group each, preserving first-seen order. */
export function groupPermissions(permissions: PermissionAskedEvent[]): PendingGroup[] {
  const map = new Map<string, PendingGroup>();
  for (const p of permissions) {
    const key = sig(p);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        key,
        representativeId: p.requestId,
        action: p.action,
        resources: p.resources,
        sessionId: p.sessionId,
        count: 1,
      });
    }
  }
  return [...map.values()];
}

/**
 * Everything the Permissions page needs, wired to the REAL runtime store:
 * pending asks come from live/recovered permission events, `answer` calls the
 * store's `replyPermission` (once/always/reject), and each decision is recorded
 * to the in-session audit log.
 */
export function usePermissions() {
  const permissions = useRuntimeStore((s) => s.permissions);
  const replyPermission = useRuntimeStore((s) => s.replyPermission);
  const approvalMode = useRuntimeStore((s) => s.approvalMode);
  const connected = useRuntimeStore((s) => s.status === "ready");
  const decisions = usePermissionLog((s) => s.decisions);
  const record = usePermissionLog((s) => s.record);
  const clearLog = usePermissionLog((s) => s.clear);

  const pending = useMemo(() => groupPermissions(permissions), [permissions]);

  const answer = async (group: PendingGroup, reply: PermissionReply) => {
    // Record first so the audit trail reflects the user's choice even if the
    // reply call later fails (the store surfaces that failure via `error`).
    record({ action: group.action, resources: group.resources, reply, sessionId: group.sessionId });
    await replyPermission(group.representativeId, reply);
  };

  return { pending, decisions, answer, clearLog, approvalMode, connected };
}
