use super::{DownloadOptions, Downloader};
use anyhow::{Context, Result};
use std::path::Path;

pub struct BlackholeDownloader {
    pub directory: String,
    pub save_magnets: bool,
    http_client: reqwest::Client,
}

impl BlackholeDownloader {
    pub fn new(directory: &str, save_magnets: bool) -> Self {
        Self {
            directory: directory.to_string(),
            save_magnets,
            http_client: reqwest::Client::new(),
        }
    }

    /// Save a .torrent file to the blackhole directory
    async fn save_torrent(&self, filename: &str, data: &[u8]) -> Result<String> {
        let dir = Path::new(&self.directory);
        if !dir.exists() {
            tokio::fs::create_dir_all(dir).await?;
        }

        // Sanitize filename
        let safe_name = sanitize_filename(filename);
        let path = dir.join(&safe_name);

        tokio::fs::write(&path, data).await?;
        tracing::info!("Saved torrent to blackhole: {:?}", path);

        Ok(path.to_string_lossy().to_string())
    }

    /// Save a magnet link as a .magnet file
    async fn save_magnet(&self, title: &str, magnet: &str) -> Result<String> {
        if !self.save_magnets {
            return Ok(String::new()); // Opted out of saving magnets
        }

        let dir = Path::new(&self.directory);
        if !dir.exists() {
            tokio::fs::create_dir_all(dir).await?;
        }

        let safe_name = sanitize_filename(&format!("{}.magnet", title));
        let path = dir.join(&safe_name);

        tokio::fs::write(&path, magnet).await?;
        tracing::info!("Saved magnet to blackhole: {:?}", path);

        Ok(path.to_string_lossy().to_string())
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[async_trait::async_trait]
impl Downloader for BlackholeDownloader {
    async fn add_torrent(&self, link: &str, options: DownloadOptions) -> Result<()> {
        let title = options.title.unwrap_or_else(|| "download".to_string());

        if link.starts_with("magnet:") {
            self.save_magnet(&title, link).await?;
        } else {
            // It's an HTTP link, we need to download the .torrent file
            let resp = self
                .http_client
                .get(link)
                .send()
                .await
                .context("Failed to download torrent file")?;

            if !resp.status().is_success() {
                anyhow::bail!("Failed to download torrent file: HTTP {}", resp.status());
            }

            let data = resp.bytes().await?;
            self.save_torrent(&format!("{}.torrent", title), &data)
                .await?;
        }

        Ok(())
    }

    async fn test_connection(&self) -> Result<()> {
        let dir = Path::new(&self.directory);
        if !dir.exists() {
            tokio::fs::create_dir_all(dir)
                .await
                .context("Failed to create blackhole directory")?;
        }

        let test_file = dir.join(".lodestarr_test");
        tokio::fs::write(&test_file, b"test")
            .await
            .context("Directory is not writable")?;
        let _ = tokio::fs::remove_file(&test_file).await;

        Ok(())
    }
}
