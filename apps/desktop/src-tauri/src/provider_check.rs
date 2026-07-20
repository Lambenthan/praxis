// Live connectivity check for a provider API key. Saving a key proves
// nothing — the setup gate must be able to say "模型连接成功" truthfully, so
// this makes one real request with the pasted key and maps the failure to a
// machine-readable code the frontend turns into a plain-language fix
// ("invalid_key" → go re-copy it; "no_balance" → top up; "network" → check
// the connection/proxy). The key is used for the request and never logged.
use std::time::Duration;

/// HTTP status → error code, None = the key works.
/// 402 is DeepSeek's "Insufficient Balance"; 401/403 cover bad or revoked
/// keys on all three providers; anything else is the provider's problem.
pub(crate) fn map_status(status: u16) -> Option<&'static str> {
    match status {
        200..=299 => None,
        401 | 403 => Some("invalid_key"),
        402 => Some("no_balance"),
        429 => Some("rate_limited"),
        _ => Some("provider_error"),
    }
}

#[tauri::command]
pub async fn verify_provider_key(provider: String, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("invalid_key: empty".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("network: {e}"))?;

    let resp = match provider.as_str() {
        // A one-token chat call, not /models: it is the only request that
        // also proves the account has balance (402), not merely that the key
        // parses (401). Costs a fraction of a cent once, at setup time.
        "deepseek" => {
            client
                .post("https://api.deepseek.com/chat/completions")
                .bearer_auth(&key)
                .header("content-type", "application/json")
                .body(r#"{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}],"max_tokens":1}"#)
                .send()
                .await
        }
        // Listing models is free and authenticated — enough to prove the key.
        "anthropic" => {
            client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
        }
        "openrouter" => {
            client
                .get("https://openrouter.ai/api/v1/key")
                .bearer_auth(&key)
                .send()
                .await
        }
        other => return Err(format!("provider_error: unknown provider {other}")),
    };

    let resp = resp.map_err(|e| {
        if e.is_timeout() {
            "network: timed out after 15s".to_string()
        } else {
            format!("network: {e}")
        }
    })?;
    let status = resp.status().as_u16();
    match map_status(status) {
        None => Ok(()),
        Some(code) => {
            // A short body tail helps diagnose "provider_error" cases without
            // dumping pages of HTML into a toast.
            let body = resp.text().await.unwrap_or_default();
            let tail: String = body.chars().take(160).collect();
            Err(format!("{code}: HTTP {status} {tail}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::map_status;

    #[test]
    fn success_range_passes() {
        assert_eq!(map_status(200), None);
        assert_eq!(map_status(204), None);
    }

    #[test]
    fn auth_balance_and_rate_map_to_codes() {
        assert_eq!(map_status(401), Some("invalid_key"));
        assert_eq!(map_status(403), Some("invalid_key"));
        assert_eq!(map_status(402), Some("no_balance"));
        assert_eq!(map_status(429), Some("rate_limited"));
    }

    #[test]
    fn everything_else_is_the_providers_problem() {
        assert_eq!(map_status(500), Some("provider_error"));
        assert_eq!(map_status(404), Some("provider_error"));
    }
}
