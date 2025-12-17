//! Search query models

use serde::{Deserialize, Serialize};

/// Type of search to perform
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SearchType {
    /// General search
    #[default]
    Search,
    /// TV show search
    TvSearch,
    /// Movie search
    Movie,
    /// Music search
    Music,
    /// Book search
    Book,
}

impl SearchType {
    /// Parse from Torznab 't' parameter
    pub fn from_param(t: &str) -> Option<Self> {
        match t.to_lowercase().as_str() {
            "search" => Some(Self::Search),
            "tvsearch" => Some(Self::TvSearch),
            "movie" => Some(Self::Movie),
            "music" => Some(Self::Music),
            "book" => Some(Self::Book),
            _ => None,
        }
    }
}

/// Search query parameters (from Torznab API)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SearchQuery {
    /// Search type
    #[serde(default)]
    pub search_type: SearchType,

    /// Free text query
    pub query: Option<String>,

    /// Category IDs to filter by
    #[serde(default)]
    pub categories: Vec<i32>,

    /// Maximum number of results
    pub limit: Option<u32>,

    /// Result offset for pagination
    pub offset: Option<u32>,

    // TV-specific parameters
    /// Season number
    pub season: Option<u32>,
    /// Episode number
    pub episode: Option<u32>,
    /// IMDB ID
    pub imdb_id: Option<String>,
    /// TVDB ID
    pub tvdb_id: Option<i32>,
    /// TMDB ID
    pub tmdb_id: Option<i32>,
    /// TVMaze ID
    pub tvmaze_id: Option<i32>,
    /// Trakt ID
    pub trakt_id: Option<i32>,
    /// Douban ID
    pub douban_id: Option<i32>,

    // Common parameters
    /// Year
    pub year: Option<u32>,
    /// Genre
    pub genre: Option<String>,

    // Music-specific parameters
    /// Album name
    pub album: Option<String>,
    /// Artist name
    pub artist: Option<String>,
    /// Record label
    pub label: Option<String>,
    /// Track name
    pub track: Option<String>,

    // Book-specific parameters
    /// Book title
    pub title: Option<String>,
    /// Author name
    pub author: Option<String>,
    /// Publisher name
    pub publisher: Option<String>,
}

impl SearchQuery {
    /// Create a new simple text search
    pub fn text(query: impl Into<String>) -> Self {
        Self {
            query: Some(query.into()),
            ..Default::default()
        }
    }
}
