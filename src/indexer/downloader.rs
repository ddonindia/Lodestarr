//! GitHub indexer definition downloader
//! Downloads indexer YAML definitions from Jackett's GitHub repository

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

const GITHUB_API_BASE: &str = "https://api.github.com";

const JACKETT_REPO: &str = "Jackett/Jackett";
const DEFINITIONS_PATH: &str = "src/Jackett.Common/Definitions";

/// GitHub API response for directory contents
#[derive(Debug, Deserialize)]
struct GitHubContent {
    name: String,
    #[serde(rename = "type")]
    content_type: String,
    download_url: Option<String>,
}

/// Metadata about an available indexer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableIndexer {
    pub name: String,
    pub filename: String,
    pub download_url: String,
}

/// Indexer downloader for fetching definitions from GitHub
pub struct IndexerDownloader {
    client: reqwest::Client,
    /// Directory for active/native indexers (where user-enabled indexers live)
    indexers_dir: String,
    /// Directory for available indexers cache (downloaded YML files from GitHub)
    available_dir: Option<String>,
}

impl IndexerDownloader {
    /// Create a new downloader
    pub fn new(indexers_dir: String, proxy_url: Option<String>) -> Self {
        Self::with_available_dir(indexers_dir, proxy_url, None)
    }

    /// Create a new downloader with available directory for caching
    pub fn with_available_dir(
        indexers_dir: String,
        proxy_url: Option<String>,
        available_dir: Option<String>,
    ) -> Self {
        let mut builder = reqwest::Client::builder().user_agent("Lodestarr-Indexer-Downloader/1.0");

        if let Some(url) = proxy_url
            && let Ok(proxy) = reqwest::Proxy::all(&url)
        {
            builder = builder.proxy(proxy);
        }

        let client = builder.build().unwrap_or_default();

        Self {
            client,
            indexers_dir,
            available_dir,
        }
    }

    /// Download a single indexer to the available directory
    pub async fn download_to_available(&self, indexer: &AvailableIndexer) -> Result<String> {
        let available_dir = self
            .available_dir
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Available directory not configured"))?;

        let response = self
            .client
            .get(&indexer.download_url)
            .send()
            .await
            .context(format!("Failed to download {}", indexer.name))?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Failed to download {}: HTTP {}",
                indexer.name,
                response.status()
            );
        }

        let yaml_content = response
            .text()
            .await
            .context("Failed to read response body")?;

        // Validate YAML before saving
        serde_yaml::from_str::<serde_yaml::Value>(&yaml_content)
            .context(format!("Invalid YAML for {}", indexer.name))?;

        // Save to available directory
        let output_path = Path::new(available_dir).join(&indexer.filename);
        fs::write(&output_path, &yaml_content)
            .await
            .context(format!("Failed to write {}", output_path.display()))?;

        Ok(output_path.display().to_string())
    }

    /// Download all available indexers to the available directory
    pub async fn download_all_to_available(&self) -> Result<usize> {
        let available_dir = self
            .available_dir
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Available directory not configured"))?;

        // Create directory if it doesn't exist
        fs::create_dir_all(available_dir).await?;

        let available = self.list_available().await?;
        let total = available.len();
        let mut downloaded = 0;

        tracing::info!("Downloading {} indexers to {}", total, available_dir);

        for (i, indexer) in available.iter().enumerate() {
            match self.download_to_available(indexer).await {
                Ok(_) => {
                    downloaded += 1;
                    if (i + 1) % 50 == 0 || i + 1 == total {
                        tracing::info!("Progress: {}/{} indexers downloaded", i + 1, total);
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to download {}: {}", indexer.name, e);
                }
            }
        }

        tracing::info!("Downloaded {} of {} indexers", downloaded, total);
        Ok(downloaded)
    }

    /// List locally available indexers from the available directory
    pub async fn list_available_local(&self) -> Result<Vec<String>> {
        let available_dir = match &self.available_dir {
            Some(dir) => dir,
            None => return Ok(Vec::new()),
        };

        let path = Path::new(available_dir);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let mut indexers = Vec::new();
        let mut entries = fs::read_dir(path).await?;

        while let Some(entry) = entries.next_entry().await? {
            if let Some(filename) = entry.file_name().to_str()
                && filename.ends_with(".yml")
            {
                let name = filename.trim_end_matches(".yml").to_string();
                indexers.push(name);
            }
        }

        Ok(indexers)
    }

    /// List all available indexer definitions from GitHub
    pub async fn list_available(&self) -> Result<Vec<AvailableIndexer>> {
        let url = format!(
            "{}/repos/{}/contents/{}",
            GITHUB_API_BASE, JACKETT_REPO, DEFINITIONS_PATH
        );

        tracing::info!("Fetching indexer list from GitHub: {}", url);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch indexer list from GitHub")?;

        if !response.status().is_success() {
            anyhow::bail!(
                "GitHub API returned error: {} - {}",
                response.status(),
                response.text().await.unwrap_or_default()
            );
        }

        let contents: Vec<GitHubContent> = response
            .json()
            .await
            .context("Failed to parse GitHub API response")?;

        let indexers: Vec<AvailableIndexer> = contents
            .into_iter()
            .filter(|item| {
                item.content_type == "file"
                    && item.name.ends_with(".yml")
                    && item.download_url.is_some()
            })
            .map(|item| {
                let name = item.name.trim_end_matches(".yml").to_string();
                AvailableIndexer {
                    name: name.clone(),
                    filename: item.name,
                    download_url: item.download_url.expect("filtered for Some"),
                }
            })
            .collect();

        tracing::info!("Found {} available indexers", indexers.len());
        Ok(indexers)
    }

    /// Download a specific indexer definition
    pub async fn download_indexer(&self, indexer: &AvailableIndexer) -> Result<String> {
        tracing::info!("Downloading indexer: {}", indexer.name);

        let response = self
            .client
            .get(&indexer.download_url)
            .send()
            .await
            .context(format!("Failed to download {}", indexer.name))?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Failed to download {}: HTTP {}",
                indexer.name,
                response.status()
            );
        }

        let yaml_content = response
            .text()
            .await
            .context("Failed to read response body")?;

        // Validate YAML before saving
        serde_yaml::from_str::<serde_yaml::Value>(&yaml_content)
            .context(format!("Invalid YAML for {}", indexer.name))?;

        // Save to indexers directory
        let output_path = Path::new(&self.indexers_dir).join(&indexer.filename);
        fs::write(&output_path, &yaml_content)
            .await
            .context(format!("Failed to write {}", output_path.display()))?;

        tracing::info!("Saved {} to {}", indexer.name, output_path.display());
        Ok(output_path.display().to_string())
    }

    /// Download multiple indexers by name
    pub async fn download_by_names(
        &self,
        names: &[String],
    ) -> Result<Vec<(String, Result<String>)>> {
        let available = self.list_available().await?;
        let mut results = Vec::new();

        for name in names {
            let name_lower = name.to_lowercase();
            if let Some(indexer) = available
                .iter()
                .find(|i| i.name.to_lowercase() == name_lower)
            {
                let result = self.download_indexer(indexer).await;
                results.push((name.clone(), result));
            } else {
                results.push((
                    name.clone(),
                    Err(anyhow::anyhow!("Indexer '{}' not found in GitHub", name)),
                ));
            }
        }

        Ok(results)
    }

    /// Download all available indexers
    pub async fn download_all(&self) -> Result<Vec<(String, Result<String>)>> {
        let available = self.list_available().await?;
        let total = available.len();
        let mut results = Vec::new();

        tracing::info!("Downloading {} indexers...", total);

        for (i, indexer) in available.iter().enumerate() {
            let result = self.download_indexer(indexer).await;
            results.push((indexer.name.clone(), result));

            if (i + 1) % 10 == 0 {
                tracing::info!("Progress: {}/{}", i + 1, total);
            }
        }

        Ok(results)
    }

    /// Update existing indexer definitions
    pub async fn update_existing(&self) -> Result<Vec<(String, Result<String>)>> {
        // List local indexers
        let local_indexers = self.list_local_indexers().await?;

        if local_indexers.is_empty() {
            return Ok(Vec::new());
        }

        tracing::info!("Updating {} local indexers...", local_indexers.len());

        // Download updates
        self.download_by_names(&local_indexers).await
    }

    /// List locally installed indexers
    pub async fn list_local_indexers(&self) -> Result<Vec<String>> {
        let path = Path::new(&self.indexers_dir);

        if !path.exists() {
            return Ok(Vec::new());
        }

        let mut indexers = Vec::new();
        let mut entries = fs::read_dir(path).await?;

        while let Some(entry) = entries.next_entry().await? {
            if let Some(filename) = entry.file_name().to_str()
                && filename.ends_with(".yml")
            {
                let name = filename.trim_end_matches(".yml").to_string();
                indexers.push(name);
            }
        }

        Ok(indexers)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_list_available() {
        let downloader = IndexerDownloader::new("./indexers".to_string(), None);
        let result = downloader.list_available().await;
        assert!(result.is_ok());
        let indexers = result.unwrap();
        assert!(!indexers.is_empty());
    }
}
