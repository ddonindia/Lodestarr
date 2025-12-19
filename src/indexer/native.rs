use async_trait::async_trait;

use super::definition::IndexerDefinition;
use super::executor::SearchExecutor;
use super::traits::{Indexer, IndexerType, SearchCapabilities};
use crate::Result;
use crate::models::{SearchQuery, TorrentResult};

/// Native indexer implementation that uses local definitions
#[allow(dead_code)]
pub struct NativeIndexer {
    definition: IndexerDefinition,
    executor: SearchExecutor,
    categories: Vec<i32>,
    capabilities: SearchCapabilities,
}

impl NativeIndexer {
    /// Create a new native indexer
    pub fn new(definition: IndexerDefinition, executor: SearchExecutor) -> Self {
        let categories = definition.extract_categories();
        let capabilities = Self::extract_capabilities(&definition);

        Self {
            definition,
            executor,
            categories,
            capabilities,
        }
    }

    /// Extract search capabilities from definition
    fn extract_capabilities(definition: &IndexerDefinition) -> SearchCapabilities {
        let mut caps = SearchCapabilities::default();

        // Check supported search modes
        // Available modes: search, tv-search, movie-search, music-search, book-search

        if definition.caps.modes.contains_key("search") {
            caps.search = true;
        }

        if definition.caps.modes.contains_key("tv-search") {
            caps.tv_search = true;

            // Check for ID search parameters in the tv-search mode
            if let Some(params) = definition.caps.modes.get("tv-search") {
                for param in params {
                    match param.as_str() {
                        "q" => {} // Standard text search
                        "season" | "ep" => caps.season_episode = true,
                        "rid" | "tvdbid" => caps.tvdb_id = true,
                        "tmdbid" => caps.tmdb_id = true,
                        "imdbid" => caps.imdb_id = true,
                        _ => {}
                    }
                }
            }
        }

        if definition.caps.modes.contains_key("movie-search") {
            caps.movie_search = true;

            if let Some(params) = definition.caps.modes.get("movie-search") {
                for param in params {
                    match param.as_str() {
                        "imdbid" => caps.imdb_id = true,
                        "tmdbid" => caps.tmdb_id = true,
                        _ => {}
                    }
                }
            }
        }

        if definition.caps.modes.contains_key("music-search") {
            caps.music_search = true;
        }

        if definition.caps.modes.contains_key("book-search") {
            caps.book_search = true;
        }

        caps
    }
}

#[async_trait]
impl Indexer for NativeIndexer {
    fn id(&self) -> &str {
        &self.definition.id
    }

    fn name(&self) -> &str {
        &self.definition.name
    }

    fn description(&self) -> &str {
        &self.definition.description
    }

    fn indexer_type(&self) -> IndexerType {
        match self.definition.indexer_type.as_str() {
            "private" => IndexerType::Private,
            "semi-private" => IndexerType::SemiPrivate,
            _ => IndexerType::Public,
        }
    }

    fn language(&self) -> &str {
        &self.definition.language
    }

    fn categories(&self) -> &[i32] {
        &self.categories
    }

    fn search_capabilities(&self) -> &SearchCapabilities {
        &self.capabilities
    }

    fn is_configured(&self) -> bool {
        // Native indexers are configured if they are loaded

        true
    }

    async fn search(&self, query: &SearchQuery) -> Result<Vec<TorrentResult>> {
        self.executor.search(&self.definition, query, None).await
    }
}
