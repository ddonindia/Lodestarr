//! Indexer manager - loads and manages indexer instances

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::definition::IndexerDefinition;
use super::executor::SearchExecutor;
use super::native::NativeIndexer;
use super::traits::Indexer;
use crate::Result;

/// Manages all loaded indexers
pub struct IndexerManager {
    /// Loaded indexer definitions
    definitions: RwLock<HashMap<String, IndexerDefinition>>,
    /// Active indexer instances
    indexers: RwLock<HashMap<String, Arc<dyn Indexer>>>,
    /// HTTP client for indexers

    /// Proxy URL
    proxy_url: Option<String>,
}

impl IndexerManager {
    /// Create a new indexer manager
    pub fn new(proxy_url: Option<&str>) -> Self {
        Self {
            definitions: RwLock::new(HashMap::new()),
            indexers: RwLock::new(HashMap::new()),
            proxy_url: proxy_url.map(String::from),
        }
    }

    /// Get all loaded definitions as objects
    pub async fn list_all_definitions(&self) -> Vec<IndexerDefinition> {
        let definitions = self.definitions.read().await;
        definitions.values().cloned().collect()
    }
    /// Get a definition by ID
    pub async fn get_definition(&self, id: &str) -> Option<IndexerDefinition> {
        let definitions = self.definitions.read().await;
        definitions.get(id).cloned()
    }

    /// Load indexer definitions from a directory
    pub async fn load_definitions(&self, path: &Path) -> Result<usize> {
        let mut count = 0;

        if !path.exists() {
            tracing::warn!("Indexers directory does not exist: {:?}", path);
            return Ok(0);
        }

        let entries = std::fs::read_dir(path)?;

        // precise locking: clear first, then populate
        let mut definitions = self.definitions.write().await;
        definitions.clear();

        let mut indexers_map = self.indexers.write().await;
        indexers_map.clear();

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "yaml" || e == "yml") {
                match IndexerDefinition::from_file(&path) {
                    Ok(def) => {
                        tracing::info!("Loaded indexer definition: {}", def.name);

                        // Create executor
                        let executor = SearchExecutor::new(self.proxy_url.as_deref())
                            .unwrap_or_else(|e| {
                                tracing::error!(
                                    "Failed to create executor for {}: {}",
                                    def.name,
                                    e
                                );
                                SearchExecutor::new(None).expect("Failed to create basic executor")
                            });

                        // Create indexer
                        let indexer = NativeIndexer::new(def.clone(), executor);
                        let id = def.id.clone();

                        // Insert definition
                        definitions.insert(id.clone(), def);

                        // Insert indexer instance
                        indexers_map.insert(id, Arc::new(indexer));

                        count += 1;
                    }
                    Err(e) => {
                        tracing::error!("Failed to load indexer from {:?}: {}", path, e);
                    }
                }
            }
        }

        Ok(count)
    }
}

impl Default for IndexerManager {
    fn default() -> Self {
        Self::new(None)
    }
}
