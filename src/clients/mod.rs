//! Download clients interface

pub mod qbittorrent;

use crate::config::{ClientType, DownloadClient};
use anyhow::{Context, Result};
use qbittorrent::QBittorrentClient;
use reqwest::Client;
use serde::Serialize;

/// Trait for download clients
#[async_trait::async_trait]
pub trait Downloader: Send + Sync {
    /// Add torrent by magnet link or URL
    async fn add_torrent(&self, link: &str) -> Result<()>;

    /// Check connectivity
    async fn test_connection(&self) -> Result<()>;
}

/// Factory to create client instances
pub fn create_client(config: &DownloadClient) -> Box<dyn Downloader> {
    match config.client_type {
        ClientType::TorrServer => Box::new(TorrServerClient::new(&config.url)),
        ClientType::QBittorrent => Box::new(QBittorrentClient::new(
            &config.url,
            config.username.clone(),
            config.password.clone(),
        )),
    }
}

/// TorrServer client implementation
pub struct TorrServerClient {
    url: String,
    client: Client,
}

impl TorrServerClient {
    pub fn new(url: &str) -> Self {
        Self {
            url: url.trim_end_matches('/').to_string(),
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }
}

#[derive(Serialize)]
struct TorrServerAddRequest {
    action: String,
    link: String,
}

#[async_trait::async_trait]
impl Downloader for TorrServerClient {
    async fn add_torrent(&self, link: &str) -> Result<()> {
        let url = format!("{}/torrents", self.url);

        let req = TorrServerAddRequest {
            action: "add".to_string(),
            link: link.to_string(),
        };

        let resp = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await
            .context("Failed to connect to TorrServer")?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("TorrServer error: {}", text);
        }

        Ok(())
    }

    async fn test_connection(&self) -> Result<()> {
        let url = format!("{}/echo", self.url);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to connect")?;

        if resp.status().is_success() {
            Ok(())
        } else {
            anyhow::bail!("TorrServer responded with status: {}", resp.status())
        }
    }
}
