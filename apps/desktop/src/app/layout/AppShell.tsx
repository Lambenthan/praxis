import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { UpdateGate } from "@/components/update/UpdateGate";
import { Toaster } from "@/components/ui/Toaster";
import { mockProject } from "@/lib/mock";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { ensureJupyter, isTauri, openExternal } from "@/lib/tauri";
import { useT } from "@/lib/i18n";

export function AppShell() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const t = useT();

  // Cmd/Ctrl+B toggles the sidebar, matching the button's tooltip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useUiStore.getState().toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // In the packaged desktop app, auto-start the bundled OpenCode and connect,
  // and bring the Jupyter server back up if the user enabled it before.
  useEffect(() => {
    void useRuntimeStore.getState().bootstrap();
    void ensureJupyter();
  }, []);

  // Until a model provider is connected the workbench can't do anything, so a
  // fresh install lands on the setup guide instead of a page the user can't
  // act on. The signal is provider state, not a stored flag (a flag set on
  // first mount can't tell "finished setup" from "closed the app early", and
  // it would trap the user out of the guide they still need). Runs at most
  // once per launch, and only before the user has navigated somewhere.
  const navigate = useNavigate();
  const setupChecked = useRef(false);
  const status = useRuntimeStore((s) => s.status);
  useEffect(() => {
    if (!isTauri || setupChecked.current || status !== "ready") return;
    setupChecked.current = true;
    // Only from the default landing page — if the user already clicked into a
    // session/settings during the connecting window, don't yank them away.
    if (window.location.pathname !== "/live" && window.location.pathname !== "/")
      return;
    void (async () => {
      // No default model set = fresh install (same signal the sidebar shows as
      // "model · not set"). getDefaultModel is a direct call that resolves even
      // when no provider is configured, so this fires reliably on first run.
      const model = await getClient()
        ?.getDefaultModel()
        .catch(() => null);
      if (!model) navigate("/setup", { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // External links open in the system browser. Navigating the webview away
  // from the app would strand the user — there is no back button.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      const href = anchor?.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        void openExternal(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // The live session page's own header doubles as the titlebar when the
  // sidebar is collapsed; every other route gets this fallback strip so the
  // macOS traffic lights don't overlap content, the window stays draggable,
  // and the sidebar can be re-expanded.
  const isMac = navigator.userAgent.includes("Mac");
  const overlayTitlebar = isTauri && isMac;
  const pageOwnsTitlebar = useLocation().pathname.startsWith("/live");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar project={mockProject} />
      <main className="flex min-w-0 flex-1 flex-col">
        {sidebarCollapsed && !pageOwnsTitlebar && (
          <div
            data-tauri-drag-region={overlayTitlebar || undefined}
            className={cn(
              "flex h-12 shrink-0 items-center",
              overlayTitlebar ? "pl-[78px]" : "pl-2",
            )}
          >
            <button
              onClick={() => setSidebarCollapsed(false)}
              aria-label={t("Expand sidebar")}
              title={`${t("Expand sidebar")} (${isMac ? "⌘B" : "Ctrl+B"})`}
              className="fade-in rounded p-1 text-text hover:bg-surface-2"
            >
              <PanelLeft size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <UpdateGate />
      <Toaster />
    </div>
  );
}
