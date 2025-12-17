//! Error types for Ferracket

use thiserror::Error;

/// Main error type for Ferracket
#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum Error {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Indexer error: {0}")]
    Indexer(String),

    #[error("Indexer not found: {0}")]
    IndexerNotFound(String),

    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("XML parsing error: {0}")]
    Xml(#[from] quick_xml::Error),

    #[error("YAML parsing error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("URL parsing error: {0}")]
    Url(#[from] url::ParseError),

    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),

    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    #[error("Search failed: {0}")]
    SearchFailed(String),
}

/// Result type alias for Ferracket operations
#[allow(dead_code)]
pub type Result<T> = std::result::Result<T, Error>;
