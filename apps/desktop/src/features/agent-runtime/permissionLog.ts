import { create } from "zustand";
import type { PermissionReply } from "@fishes/sdk";

/**
 * A record of one permission decision the user made from the Permissions page.
 *
 * This is a REAL audit trail of actions taken here — not a fabricated grants
 * list. It is in-memory and session-scoped: OpenCode has no API to enumerate
 * the standing "always" rules it persists server-side, so this log only covers
 * decisions made through this screen during the current app session. An app
 * restart clears it (documented in the UI).
 */
export interface PermissionDecision {
  /** Unique row id (for React keys and dedupe). */
  id: string;
  /** e.g. "bash", "write", "edit". */
  action: string;
  /** The concrete targets (a command line, file paths). */
  resources: string[];
  /** What the user chose. */
  reply: PermissionReply;
  /** Session the request belonged to. */
  sessionId: string;
  /** Epoch ms when the decision was recorded. */
  at: number;
}

interface PermissionLogState {
  decisions: PermissionDecision[];
  /** Append a decision (newest first, capped so it can never grow unbounded). */
  record: (d: Omit<PermissionDecision, "id" | "at">) => void;
  clear: () => void;
}

const MAX = 100;

export const usePermissionLog = create<PermissionLogState>((set) => ({
  decisions: [],
  record: (d) =>
    set((s) => ({
      decisions: [
        {
          ...d,
          at: Date.now(),
          id: `${d.sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        },
        ...s.decisions,
      ].slice(0, MAX),
    })),
  clear: () => set({ decisions: [] }),
}));
