import { useState } from "react";
import { Command } from "cmdk";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import type { ProviderInfo } from "@fishes/sdk";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

interface ModelPickerProps {
  providers: ProviderInfo[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Searchable model picker — a plain `<select>` is unusable once a provider
 *  (e.g. OpenRouter) lists 50+ models; this replaces it with a keyword-filtered,
 *  provider-grouped list built on the same cmdk primitive as the command palette. */
export function ModelPicker({ providers, value, onChange, disabled }: ModelPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const selected = providers
    .flatMap((p) => p.models.map((m) => ({ p, m })))
    .find(({ p, m }) => `${p.id}/${m.id}` === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-input border border-border bg-surface px-3",
            "text-left text-[14px] text-text outline-none transition-colors hover:bg-surface-2",
            "focus:border-accent/60 disabled:opacity-50",
          )}
        >
          <span className={cn("flex-1 truncate", !selected && "text-muted")}>
            {selected ? selected.m.name : t("Not set — pick a default model")}
          </span>
          <ChevronDown size={14} className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[--radix-popover-trigger-width] overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        >
          <Command
            label={t("Search models…")}
            filter={(itemValue, search, keywords) => {
              const haystack = `${itemValue} ${(keywords ?? []).join(" ")}`.toLowerCase();
              return haystack.includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search size={14} className="shrink-0 text-muted" />
              <Command.Input
                autoFocus
                placeholder={t("Search models…")}
                className="w-full bg-transparent py-2.5 text-[14px] text-text outline-none placeholder:text-muted"
              />
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-[14px] text-muted">
                {t("No matches.")}
              </Command.Empty>
              {providers.map((p) => (
                <Command.Group
                  key={p.id}
                  heading={p.name}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
                >
                  {p.models.map((m) => {
                    const itemValue = `${p.id}/${m.id}`;
                    return (
                      <Command.Item
                        key={m.id}
                        value={itemValue}
                        keywords={[m.name]}
                        onSelect={() => {
                          onChange(itemValue);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-input px-2 py-1.5 text-[14px] text-text data-[selected=true]:bg-surface-2"
                      >
                        <Check
                          size={13}
                          className={cn("shrink-0", itemValue === value ? "opacity-100" : "opacity-0")}
                        />
                        <span className="truncate">{m.name}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
