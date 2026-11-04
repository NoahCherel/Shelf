//! HTTP for providers. Secrets are filled in here, so keys never reach the page.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct SecretRef {
    id: String,
    header: String,
    prefix: Option<String>,
}

#[derive(Deserialize)]
pub struct HttpGet {
    url: String,
    headers: Option<HashMap<String, String>>,
    secret: Option<SecretRef>,
}

#[derive(Serialize)]
pub struct HttpResponse {
    status: u16,
    body: String,
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Shelf-dock")
        .build()
        .expect("failed to build HTTP client")
}

fn header_value(prefix: Option<&str>, secret: &str) -> String {
    format!("{}{secret}", prefix.unwrap_or(""))
}

fn allowed_url(url: &str, has_secret: bool) -> bool {
    url.starts_with("https://") || (!has_secret && url.starts_with("http://"))
}

/// Errors are a plain string: "offline" for network failures, which providers
/// turn into their own typed error.
#[tauri::command]
pub async fn http_get(client: State<'_, reqwest::Client>, req: HttpGet) -> Result<HttpResponse, String> {
    if !allowed_url(&req.url, req.secret.is_some()) {
        return Err("url not allowed".into());
    }
    let mut request = client.get(&req.url);
    for (k, v) in req.headers.unwrap_or_default() {
        request = request.header(k, v);
    }
    if let Some(secret) = req.secret {
        let value = crate::secrets::get(&secret.id).ok_or("no secret")?;
        request = request.header(secret.header, header_value(secret.prefix.as_deref(), &value));
    }
    let response = request.send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() {
            "offline".to_string()
        } else {
            e.without_url().to_string()
        }
    })?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|_| "offline".to_string())?;
    Ok(HttpResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_header_value_joins_prefix_and_secret() {
        assert_eq!(header_value(Some("Bearer "), "abc"), "Bearer abc");
        assert_eq!(header_value(None, "abc"), "abc");
    }

    #[test]
    fn secrets_only_travel_over_https() {
        assert!(allowed_url("https://api.stripe.com/v1", true));
        assert!(!allowed_url("http://api.stripe.com/v1", true));
        assert!(allowed_url("http://example.test", false));
        assert!(!allowed_url("file:///c:/x", false));
    }
}
