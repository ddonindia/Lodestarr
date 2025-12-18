//! Indexer trait definition

use crate::Result;
use crate::models::{SearchQuery, TorrentResult};
use async_trait::async_trait;

/// Trait that all indexers must implement
#[async_trait]
#[allow(dead_code)]
pub trait Indexer: Send + Sync {
    /// Get the unique identifier for this indexer
    fn id(&self) -> &str;

    /// Get the display name for this indexer
    fn name(&self) -> &str;

    /// Get a description of this indexer
    fn description(&self) -> &str;

    /// Get the indexer type (public, semi-private, private)
    fn indexer_type(&self) -> IndexerType;

    /// Get the language/locale of this indexer
    fn language(&self) -> &str;

    /// Get supported categories
    fn categories(&self) -> &[i32];

    /// Get supported search types
    fn search_capabilities(&self) -> &SearchCapabilities;

    /// Check if the indexer is configured and ready
    fn is_configured(&self) -> bool;

    /// Perform a search
    async fn search(&self, query: &SearchQuery) -> Result<Vec<TorrentResult>>;

    /// Test the indexer connection
    async fn test(&self) -> Result<bool> {
        // Default implementation: try a simple search
        let query = SearchQuery::text("test");
        self.search(&query).await.map(|_| true)
    }
}

/// Type of indexer
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[allow(dead_code)]
pub enum IndexerType {
    /// Public indexer (no login required)
    #[default]
    Public,
    /// Semi-private (free registration)
    SemiPrivate,
    /// Private (invite only)
    Private,
}

impl std::fmt::Display for IndexerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Public => write!(f, "public"),
            Self::SemiPrivate => write!(f, "semi-private"),
            Self::Private => write!(f, "private"),
        }
    }
}

/// Search capabilities of an indexer
#[derive(Debug, Clone, Default)]
pub struct SearchCapabilities {
    /// Supports general text search
    pub search: bool,
    /// Supports TV search
    pub tv_search: bool,
    /// Supports movie search
    pub movie_search: bool,
    /// Supports music search
    pub music_search: bool,
    /// Supports book search
    pub book_search: bool,

    /// Supports IMDB ID search
    pub imdb_id: bool,
    /// Supports TVDB ID search
    pub tvdb_id: bool,
    /// Supports TMDB ID search
    pub tmdb_id: bool,
    /// Supports season/episode search
    pub season_episode: bool,
}

impl SearchCapabilities {
    /// Default capabilities for a basic public indexer
    pub fn basic() -> Self {
        Self {
            search: true,
            tv_search: true,
            movie_search: true,
            ..Default::default()
        }
    }
}
