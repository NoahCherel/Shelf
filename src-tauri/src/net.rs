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

/// The error and every cause under it, as SChannel's reason for refusing a certificate is deep down.
fn error_chain(e: &reqwest::Error) -> String {
    let mut text = e.to_string();
    let mut cause = std::error::Error::source(e);
    while let Some(c) = cause {
        text.push_str(": ");
        text.push_str(&c.to_string());
        cause = c.source();
    }
    text
}

/// "certificate" when a secure connection was refused, as behind a company proxy that inspects
/// traffic with a certificate Windows doesn't trust; "offline" when nothing answered; else the error.
/// A refused certificate is also a connection error to reqwest, so it's looked for first.
fn failure_text(connect: bool, timeout: bool, chain: &str) -> String {
    let lower = chain.to_lowercase();
    // The certificate wasn't refused: the server that vouches for it couldn't be reached, as when
    // the PC wakes before its network is fully up.
    let check_unreachable = lower.contains("revocation server was offline") || lower.contains("revocation_offline");
    if check_unreachable {
        "offline".into()
    } else if lower.contains("certificate") || lower.contains("revocation") {
        "certificate".into()
    } else if connect || timeout {
        "offline".into()
    } else {
        chain.to_string()
    }
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
        let (connect, timeout) = (e.is_connect(), e.is_timeout());
        failure_text(connect, timeout, &error_chain(&e.without_url()))
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

#[cfg(test)]
mod failure_tests {
    use super::failure_text;

    #[test]
    fn an_untrusted_certificate_is_named() {
        let chain = "error sending request: error trying to connect: The certificate chain was issued by an authority that is not trusted.";
        assert_eq!(failure_text(true, false, chain), "certificate");
    }

    #[test]
    fn a_revocation_check_failure_is_named_too() {
        let chain = "error trying to connect: The revocation function was unable to check revocation for the certificate.";
        assert_eq!(failure_text(true, false, chain), "certificate");
        assert_eq!(failure_text(true, false, "CRYPT_E_NO_REVOCATION_CHECK"), "certificate");
    }

    #[test]
    fn a_revocation_server_out_of_reach_is_offline() {
        // Right after waking, the network can be half up: the certificate isn't refused, its check couldn't run.
        let chain = "error trying to connect: The revocation function was unable to check revocation because the revocation server was offline.";
        assert_eq!(failure_text(true, false, chain), "offline");
        assert_eq!(failure_text(true, false, "CRYPT_E_REVOCATION_OFFLINE"), "offline");
    }

    #[test]
    fn a_dropped_connection_is_offline() {
        assert_eq!(failure_text(true, false, "connection refused"), "offline");
        assert_eq!(failure_text(false, true, ""), "offline");
    }

    #[test]
    fn anything_else_is_told_as_it_is() {
        assert_eq!(failure_text(false, false, "builder error"), "builder error");
    }
}
