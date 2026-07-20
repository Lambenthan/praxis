import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getClient, setupNeverCompleted, useRuntimeStore } from "@/lib/runtime";
import { isTauri, setupCompletedOnDisk } from "@/lib/tauri";

/**
 * First-run guard. A fresh install (no model provider of the user's own) is
 * sent to the setup guide — a normal full page, not a blocking modal — and
 * any navigation elsewhere lands back there until a verified key is saved
 * (SetupPage flips `setupNeeded` off at that moment). The app is never usable
 * unconfigured, but the user is guided on a page they can read and act on,
 * not locked out behind a blurred overlay.
 *
 * A transient IPC hiccup must NOT fail open (that would defeat the guard):
 * the check retries with backoff, and if it still can't complete it fails
 * CLOSED — the user stays on the setup guide, whose own status readouts and
 * actions recover the moment the runtime answers again.
 */
export function SetupGate() {
  const status = useRuntimeStore((s) => s.status);
  const needed = useRuntimeStore((s) => s.setupNeeded);
  const setNeeded = useRuntimeStore((s) => s.setSetupNeeded);
  const location = useLocation();
  const navigate = useNavigate();
  // Example sessions are read-only previews — deliberately viewable before
  // setup so a new user can see what the workbench produces before committing
  // a key. Every action that needs a model (new/live session) still routes to
  // the guide; only the `/example/*` transcripts are exempt from the trap.
  const onExample = location.pathname.startsWith("/example");
  // The live check can only run once the runtime is up — seconds after launch
  // (longer on a cold Windows start). A first run must not show the main page
  // for even a frame, so the persisted flag routes to the guide immediately;
  // the check then confirms or releases.
  const [fresh] = useState(() => isTauri && setupNeverCompleted());

  useEffect(() => {
    if (fresh && needed === null && location.pathname !== "/setup" && !onExample) {
      navigate("/setup", { replace: true });
    }
  }, [fresh, needed, location.pathname, navigate, onExample]);

  // The localStorage flag is memory, not truth: it survives an app-data wipe
  // (webview storage lives elsewhere), so a "done" install can actually have
  // no key on disk — and the user would sit on a dead workbench for the whole
  // sidecar boot before the live check finally routed them. Ask the disk
  // (auth.json exists?) the moment the window opens — milliseconds, no
  // sidecar needed — and route a truly-unconfigured install to setup now.
  // setNeeded(true) also clears the stale flag, so the next launch is instant.
  useEffect(() => {
    if (!isTauri || fresh) return; // fresh already routed synchronously
    let cancelled = false;
    void setupCompletedOnDisk()
      .then((onDisk) => {
        if (!cancelled && !onDisk && useRuntimeStore.getState().setupNeeded === null) {
          setNeeded(true);
        }
      })
      .catch(() => {}); // IPC hiccup — the live check once ready still guards

    return () => {
      cancelled = true;
    };
  }, [fresh, setNeeded]);

  useEffect(() => {
    if (!isTauri || status !== "ready" || needed !== null) return;
    let cancelled = false;
    void (async () => {
      const delays = [0, 600, 1500];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
        try {
          const provs = await getClient()!.listProviders();
          if (!cancelled) setNeeded(!provs.some((p) => p.id !== "opencode"));
          return;
        } catch {
          // fail CLOSED — the setup guide, not the workbench, is the safe place
          if (attempt === delays.length - 1 && !cancelled) setNeeded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, needed, setNeeded]);

  useEffect(() => {
    if (needed === true && location.pathname !== "/setup" && !onExample) {
      navigate("/setup", { replace: true });
    }
  }, [needed, location.pathname, navigate, onExample]);

  return null;
}
