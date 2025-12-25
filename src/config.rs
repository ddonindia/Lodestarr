use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub indexers: Vec<IndexerConfig>,
    pub download_path: Option<String>,
    pub proxy_url: Option<String>,
    pub db_path: Option<String>,
    pub indexers_path: Option<String>,
    #[serde(default)]
    pub disabled_indexers: Vec<String>,

    /// Override settings for native indexers (IndexID -> Key -> Value)
    #[serde(default)]
    pub native_settings:
        std::collections::HashMap<String, std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexerConfig {
    pub name: String,
    pub url: String,
    pub apikey: Option<String>,
}

impl Config {
    pub fn load() -> Result<Self> {
        let path = Self::config_path()?;

        if !path.exists() {
            return Ok(Config::default());
        }

        let content = fs::read_to_string(&path).context("Failed to read config file")?;

        let config: Config = toml::from_str(&content).context("Failed to parse config file")?;

        Ok(config)
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_path()?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let content = toml::to_string_pretty(self)?;
        fs::write(&path, content)?;

        Ok(())
    }

    fn config_path() -> Result<PathBuf> {
        let proj_dirs = ProjectDirs::from("com", "lodestarr", "lodestarr")
            .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

        Ok(proj_dirs.config_dir().join("config.toml"))
    }

    pub fn get_db_path(&self) -> Result<PathBuf> {
        if let Some(path) = &self.db_path {
            return Ok(PathBuf::from(path));
        }

        let proj_dirs = ProjectDirs::from("com", "lodestarr", "lodestarr")
            .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

        Ok(proj_dirs.config_dir().join("lodestarr.db"))
    }

    pub fn get_indexers_path(&self) -> Result<PathBuf> {
        if let Some(path) = &self.indexers_path {
            return Ok(PathBuf::from(path));
        }

        let proj_dirs = ProjectDirs::from("com", "lodestarr", "lodestarr")
            .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

        Ok(proj_dirs.config_dir().join("indexers"))
    }

    /// Get path for available indexers cache: indexers/available/
    pub fn get_available_indexers_path(&self) -> Result<PathBuf> {
        Ok(self.get_indexers_path()?.join("available"))
    }

    /// Get path for active native indexers: indexers/active/native/
    pub fn get_active_native_path(&self) -> Result<PathBuf> {
        Ok(self.get_indexers_path()?.join("active").join("native"))
    }

    pub fn add_indexer(&mut self, name: String, url: String, apikey: Option<String>) {
        // Remove existing if name matches
        self.indexers.retain(|i| i.name != name);

        self.indexers.push(IndexerConfig { name, url, apikey });
    }

    pub fn remove_indexer(&mut self, name: &str) -> bool {
        let len_before = self.indexers.len();
        self.indexers.retain(|i| i.name != name);
        self.indexers.len() < len_before
    }

    pub fn get_indexer(&self, name: &str) -> Option<&IndexerConfig> {
        self.indexers.iter().find(|i| i.name == name)
    }

    pub fn is_enabled(&self, name: &str) -> bool {
        !self.disabled_indexers.contains(&name.to_string())
    }

    pub fn set_enabled(&mut self, name: &str, enabled: bool) {
        if enabled {
            self.disabled_indexers.retain(|x| x != name);
        } else if !self.disabled_indexers.contains(&name.to_string()) {
            self.disabled_indexers.push(name.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_indexer() {
        let mut config = Config::default();
        config.add_indexer("Test".to_string(), "http://test.com".to_string(), None);

        assert_eq!(config.indexers.len(), 1);
        assert_eq!(config.indexers[0].name, "Test");
        assert_eq!(config.indexers[0].url, "http://test.com");
    }

    #[test]
    fn test_add_indexer_overwrite() {
        let mut config = Config::default();
        config.add_indexer("Test".to_string(), "http://test.com".to_string(), None);
        config.add_indexer(
            "Test".to_string(),
            "http://updated.com".to_string(),
            Some("key".to_string()),
        );

        assert_eq!(config.indexers.len(), 1);
        assert_eq!(config.indexers[0].url, "http://updated.com");
        assert_eq!(config.indexers[0].apikey.as_deref(), Some("key"));
    }

    #[test]
    fn test_remove_indexer() {
        let mut config = Config::default();
        config.add_indexer("Test1".to_string(), "http://t1.com".to_string(), None);
        config.add_indexer("Test2".to_string(), "http://t2.com".to_string(), None);

        assert!(config.remove_indexer("Test1"));
        assert_eq!(config.indexers.len(), 1);
        assert_eq!(config.indexers[0].name, "Test2");

        assert!(!config.remove_indexer("NonExistent"));
    }
}
