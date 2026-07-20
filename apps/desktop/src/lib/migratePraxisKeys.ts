// One-time localStorage migration from the pre-rename Praxis build. Every UI
// preference was namespaced `praxis.*` (pane widths, graph-open flag, UI zoom,
// guided-mode); after the rename the app reads `fishes.*`. Copy any surviving
// old key to its new name once, so an updated install keeps its layout instead
// of snapping back to defaults. Idempotent and cheap: guarded by a done-flag,
// and it never overwrites a value the new build already wrote.
const DONE_FLAG = "fishes.migrated-from-praxis";

export function migratePraxisKeys(): void {
  try {
    if (localStorage.getItem(DONE_FLAG)) return;
    const oldKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("praxis.")) oldKeys.push(key);
    }
    for (const key of oldKeys) {
      const next = "fishes." + key.slice("praxis.".length);
      if (localStorage.getItem(next) === null) {
        const val = localStorage.getItem(key);
        if (val !== null) localStorage.setItem(next, val);
      }
    }
    localStorage.setItem(DONE_FLAG, "1");
  } catch {
    /* private-mode / disabled storage — nothing to migrate */
  }
}

// Run at import time so it lands BEFORE side-effect modules that read their key
// on load (e.g. ./zoom). Import this module before those. Idempotent (DONE_FLAG).
migratePraxisKeys();
