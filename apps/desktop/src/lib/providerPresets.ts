/** Providers a first-time user can connect without knowing what a provider
 *  is: pick one, paste a key, done. Used by the Setup guide page; everything
 *  else lives in Settings. */
export const PROVIDER_PRESETS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "cheap, steady, reachable from mainland China",
    keyUrl: "https://platform.deepseek.com/api_keys",
    model: "deepseek-chat",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "one key that unlocks many models",
    keyUrl: "https://openrouter.ai/settings/keys",
    model: "anthropic/claude-sonnet-4.5",
  },
] as const;

export type ProviderPresetId = (typeof PROVIDER_PRESETS)[number]["id"];

/** verify_provider_key / test_stata_bridge reject with "<code>: detail".
 *  Split that into a translatable headline (what happened + what to do) and
 *  the raw detail for the fine print. Unknown codes fall through to the
 *  detail so a real message is never swallowed. */
export function explainCheckError(raw: unknown): { message: string; detail: string } {
  const text = raw instanceof Error ? raw.message : String(raw);
  const m = text.match(/^([a-z_]+):\s*([\s\S]*)$/);
  const code = m?.[1] ?? "";
  const detail = (m?.[2] ?? text).trim();
  const message =
    {
      invalid_key:
        "The key was rejected — it may be mistyped or deleted. Copy it again from the provider's site and paste the whole thing.",
      no_balance:
        "The key works, but the account has no balance. Top up on the provider's site, then retry.",
      rate_limited: "The provider says too many requests — wait a few seconds and retry.",
      network:
        "Could not reach the provider — check your internet connection (or proxy), then retry.",
      provider_error: "The provider returned an unexpected error — retry in a minute.",
      bridge_env_missing: "The isolated environment was not created — run Enable Stata again.",
      bridge_import: "The bridge package did not install cleanly — run Enable Stata again.",
      // "wasn't found", never "you don't have it" — the search is a heuristic
      // and the manual picker right below is the user's final say.
      stata_not_found:
        "The search couldn't find Stata. If it's installed, use \"Choose the Stata program manually\" to point at it; otherwise skip — R and Python analyses work without it.",
      stata_pick_invalid:
        "That selection doesn't contain a runnable Stata program — pick the Stata executable itself (on macOS, the Stata app).",
    }[code] ?? detail;
  return { message, detail: message === detail ? "" : detail };
}
