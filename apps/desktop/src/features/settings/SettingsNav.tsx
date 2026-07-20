import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Cpu,
  FolderOpen,
  Info,
  Languages,
  Plug,
  Server,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/cn";

/** Every settings section, in nav order. */
export type SettingsSectionId =
  | "general"
  | "model"
  | "runtime"
  | "data"
  | "language"
  | "about"
  | "connectors"
  | "permissions";

interface NavItem {
  id: SettingsSectionId;
  /** English source string — passed through `t()` at render. */
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** English source string for the group header. */
  label: string;
  items: NavItem[];
}

/**
 * The left-nav model. Two labelled groups mirror Claude Science's
 * Workspace + Capabilities grammar, mapped onto what Fishes actually exposes
 * today — no placeholder pages for features Fishes doesn't have.
 */
export const SETTINGS_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "general", label: "General", icon: SlidersHorizontal },
      { id: "model", label: "Model", icon: Cpu },
      { id: "runtime", label: "Agent runtime", icon: Server },
      { id: "data", label: "Data", icon: FolderOpen },
      { id: "language", label: "Language", icon: Languages },
      { id: "about", label: "About", icon: Info },
    ],
  },
  {
    label: "Capabilities",
    items: [
      { id: "connectors", label: "Connectors", icon: Plug },
      { id: "permissions", label: "Permissions", icon: ShieldCheck },
    ],
  },
];

const SETTINGS_TAB_KEY = "fishes:settings-tab";

const ALL_IDS: SettingsSectionId[] = SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** The persisted active tab, or `general` when none/invalid is stored. */
export function readSettingsTab(): SettingsSectionId {
  try {
    const stored = localStorage.getItem(SETTINGS_TAB_KEY);
    if (stored && (ALL_IDS as string[]).includes(stored)) return stored as SettingsSectionId;
  } catch {
    // localStorage unavailable (tests) — fall through to the default
  }
  return "general";
}

/** Persist the active tab (best-effort — a storage failure is silent). */
export function writeSettingsTab(id: SettingsSectionId): void {
  try {
    localStorage.setItem(SETTINGS_TAB_KEY, id);
  } catch {
    // best-effort
  }
}

export function SettingsNav({
  active,
  onSelect,
  t,
}: {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  t: (source: string) => string;
}) {
  return (
    <nav
      aria-label={t("Settings")}
      className="w-52 shrink-0 overflow-y-auto border-r border-border px-3 py-6"
    >
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="mb-5 last:mb-0">
          <div className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            {t(group.label)}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`settings-tab-${item.id}`}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-input px-2.5 text-left text-[14px] transition-colors",
                    isActive
                      ? "bg-surface-2 font-medium text-text"
                      : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                  {isActive && <ChevronRight size={13} className="shrink-0 text-muted" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
