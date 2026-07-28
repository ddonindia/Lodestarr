use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub release_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
}

pub struct UpdateChecker {
    client: Client,
    cached_info: Arc<RwLock<Option<(UpdateInfo, Instant)>>>,
}

impl UpdateChecker {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent(concat!("Lodestarr/", env!("CARGO_PKG_VERSION")))
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            cached_info: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn check_for_updates(&self) -> Result<UpdateInfo> {
        let current_version = env!("CARGO_PKG_VERSION").to_string();

        // Check cache (1 hour TTL)
        {
            let cache = self.cached_info.read().await;
            if let Some((info, time)) = &*cache
                && time.elapsed() < Duration::from_secs(3600)
            {
                return Ok(info.clone());
            }
        }

        // Fetch from GitHub
        let url = "https://api.github.com/repos/ddonindia/Lodestarr/releases/latest";
        let res = self.client.get(url).send().await?;

        if res.status().is_success() {
            let release: GithubRelease = res.json().await?;
            let latest_version = release.tag_name.trim_start_matches('v').to_string();

            // Simple version string comparison
            let update_available = current_version != latest_version;

            let info = UpdateInfo {
                current_version,
                latest_version: Some(latest_version),
                update_available,
                release_url: Some(release.html_url),
            };

            let mut cache = self.cached_info.write().await;
            *cache = Some((info.clone(), Instant::now()));

            Ok(info)
        } else {
            // Rate limit or other error
            let info = UpdateInfo {
                current_version,
                latest_version: None,
                update_available: false,
                release_url: None,
            };
            Ok(info)
        }
    }
}
