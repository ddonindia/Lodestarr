use crate::clients::Downloader;
use anyhow::{Context, Result};
use qbit_rs::{
    Qbit,
    model::{AddTorrentArg, Credential, TorrentSource},
};
use reqwest::Url;
use std::sync::Arc;

pub struct QBittorrentClient {
    qbit: Arc<Qbit>,
}

impl QBittorrentClient {
    pub fn new(url: &str, username: Option<String>, password: Option<String>) -> Self {
        let u = username.unwrap_or_default();
        let p = password.unwrap_or_default();
        let credential = Credential::new(u, p);

        let qbit = Qbit::new(url, credential);

        Self {
            qbit: Arc::new(qbit),
        }
    }

    async fn ensure_login(&self) -> Result<()> {
        self.qbit
            .login(false)
            .await
            .context("Failed to login to qBittorrent")?;
        Ok(())
    }
}

#[async_trait::async_trait]
impl Downloader for QBittorrentClient {
    async fn add_torrent(&self, link: &str) -> Result<()> {
        self.ensure_login().await?;

        let url = Url::parse(link).context("Invalid torrent URL")?;
        let arg = AddTorrentArg::builder()
            .source(TorrentSource::Urls {
                urls: vec![url].into(),
            }) // Assuming Into<Sep> works
            .build();

        self.qbit
            .add_torrent(arg)
            .await
            .context("Failed to add torrent")?;

        Ok(())
    }

    async fn test_connection(&self) -> Result<()> {
        self.ensure_login().await?;

        let version = self
            .qbit
            .get_version()
            .await
            .context("Failed to get version")?;

        if version.is_empty() {
            anyhow::bail!("Got empty version string");
        }

        Ok(())
    }
}
