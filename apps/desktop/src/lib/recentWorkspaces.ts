// Recently-opened project folders, Claude-Code style: picking a folder IS
// entering a project, and the composer's folder chip offers a "Recent" list so
// you hop between projects without re-navigating the native picker every time.
// Persisted locally (paths only; no content) and capped.
const KEY = "fishes.recent-workspaces";
const MAX = 8;

export function getRecentWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Record a folder as most-recently-used (dedup, newest first, capped). */
export function pushRecentWorkspace(path: string | null | undefined): void {
  if (!path) return;
  try {
    const next = [path, ...getRecentWorkspaces().filter((p) => p !== path)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — recents are best-effort */
  }
}

/** Replace the stored list (used to prune folders that no longer exist). */
export function setRecentWorkspaces(paths: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(paths.slice(0, MAX)));
  } catch {
    /* storage disabled — recents are best-effort */
  }
}
