
use reqwest::Proxy;
use serde::Serialize;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const USER_AGENT: &str = concat!("aether-gui/", env!("CARGO_PKG_VERSION"), " leak-check");

pub(crate) const ENDPOINT_IPWHO: &str = "https://ipwho.is/";
pub(crate) const ENDPOINT_IPAPI: &str = "https://ipapi.co/json/";

#[derive(Debug, Serialize, Clone)]
pub struct PublicInfo {
    pub ip: String,
    pub ip_version: String,
    pub country_code: Option<String>,
    pub city: Option<String>,
    pub org: Option<String>,
}

fn client(through_tunnel: bool, bind_addr: &str) -> Result<reqwest::Client, reqwest::Error> {
    let mut builder = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT);
    if through_tunnel {
        let proxy = Proxy::all(format!("socks5h://{}", bind_addr))?;
        builder = builder.proxy(proxy);
    }
    builder.build()
}

pub(crate) fn parse(v: &serde_json::Value) -> Option<PublicInfo> {
    let ip = v.get("ip").and_then(|x| x.as_str())?.to_string();
    let ip_version = v
        .get("type")
        .and_then(|x| x.as_str())
        .filter(|t| t.eq_ignore_ascii_case("ipv6"))
        .map(|_| "IPv6".to_string())
        .unwrap_or_else(|| {
            if ip.contains(':') {
                "IPv6".to_string()
            } else {
                "IPv4".to_string()
            }
        });
    Some(PublicInfo {
        ip,
        ip_version,
        country_code: v
            .get("country_code")
            .or_else(|| v.get("country"))
            .and_then(|x| x.as_str())
            .map(String::from),
        city: v.get("city").and_then(|x| x.as_str()).map(String::from),
        org: v
            .get("connection")
            .and_then(|c| c.get("org"))
            .and_then(|x| x.as_str())
            .map(String::from),
    })
}

async fn fetch_from(client: &reqwest::Client, url: &str) -> Option<PublicInfo> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    if v.get("success").and_then(|x| x.as_bool()) == Some(false) {
        return None;
    }
    parse(&v)
}

pub async fn fetch_public_info(through_tunnel: bool, bind_addr: &str) -> Option<PublicInfo> {
    let client = client(through_tunnel, bind_addr).ok()?;
    if let Some(info) = fetch_from(&client, ENDPOINT_IPWHO).await {
        return Some(info);
    }
    fetch_from(&client, ENDPOINT_IPAPI).await
}
