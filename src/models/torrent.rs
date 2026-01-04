//! Torrent result model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A single torrent search result
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TorrentResult {
    /// Torrent title
    #[serde(rename = "Title")]
    pub title: String,

    /// GUID (unique identifier, usually the details URL)
    #[serde(rename = "Guid")]
    pub guid: String,

    /// Link to torrent file or magnet
    #[serde(rename = "Link")]
    pub link: Option<String>,

    /// Details/info page URL
    #[serde(rename = "Comments")]
    pub details: Option<String>,

    /// Magnet link
    #[serde(rename = "Magnet", skip_serializing_if = "Option::is_none")]
    pub magnet: Option<String>,

    /// Publication date
    #[serde(rename = "PublishDate")]
    pub publish_date: Option<DateTime<Utc>>,

    /// Category IDs (Torznab categories)
    #[serde(rename = "Category", default)]
    pub categories: Vec<i32>,

    /// Size in bytes
    #[serde(rename = "Size")]
    pub size: Option<u64>,

    /// Number of files
    #[serde(rename = "Files", skip_serializing_if = "Option::is_none")]
    pub files: Option<u32>,

    /// Grabs/downloads count
    #[serde(rename = "Grabs")]
    pub grabs: Option<u32>,

    /// Seeders count
    #[serde(rename = "Seeders")]
    pub seeders: Option<u32>,

    /// Leechers/peers count
    #[serde(rename = "Peers")]
    pub leechers: Option<u32>,

    /// Info hash
    #[serde(rename = "InfoHash", skip_serializing_if = "Option::is_none")]
    pub info_hash: Option<String>,

    /// IMDB ID (for movies/TV)
    #[serde(rename = "ImdbId", skip_serializing_if = "Option::is_none")]
    pub imdb_id: Option<String>,

    /// TMDB ID
    #[serde(rename = "TmdbId", skip_serializing_if = "Option::is_none")]
    pub tmdb_id: Option<i32>,

    /// TVDB ID  
    #[serde(rename = "TvdbId", skip_serializing_if = "Option::is_none")]
    pub tvdb_id: Option<i32>,

    /// Uploader name
    #[serde(rename = "Uploader", skip_serializing_if = "Option::is_none")]
    pub uploader: Option<String>,

    /// Minimum ratio required
    #[serde(rename = "MinimumRatio", skip_serializing_if = "Option::is_none")]
    pub minimum_ratio: Option<f64>,

    /// Minimum seedtime in seconds
    #[serde(rename = "MinimumSeedTime", skip_serializing_if = "Option::is_none")]
    pub minimum_seedtime: Option<u64>,

    /// Download volume factor (0 = freeleech)
    #[serde(
        rename = "DownloadVolumeFactor",
        skip_serializing_if = "Option::is_none"
    )]
    pub download_volume_factor: Option<f64>,

    /// Upload volume factor
    #[serde(rename = "UploadVolumeFactor", skip_serializing_if = "Option::is_none")]
    pub upload_volume_factor: Option<f64>,

    /// Indexer that returned this result
    #[serde(rename = "Indexer", skip_serializing_if = "Option::is_none")]
    pub indexer: Option<String>,

    /// Indexer flags (freeleech, scene, internal, etc.)
    #[serde(rename = "Flags", default, skip_serializing_if = "Vec::is_empty")]
    pub flags: Vec<String>,

    /// Description/summary text
    #[serde(rename = "Description", skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Genre tags
    #[serde(rename = "Genre", skip_serializing_if = "Option::is_none")]  
    pub genre: Option<String>,

    /// Poster image URL
    #[serde(rename = "Poster", skip_serializing_if = "Option::is_none")]
    pub poster: Option<String>,
}

impl TorrentResult {
    /// Create a new torrent result with minimal required fields
    pub fn new(title: String, guid: String) -> Self {
        Self {
            title,
            guid,
            link: None,
            details: None,
            magnet: None,
            publish_date: None,
            categories: Vec::new(),
            size: None,
            files: None,
            grabs: None,
            seeders: None,
            leechers: None,
            info_hash: None,
            imdb_id: None,
            tmdb_id: None,
            tvdb_id: None,
            uploader: None,
            minimum_ratio: None,
            minimum_seedtime: None,
            download_volume_factor: None,
            upload_volume_factor: None,
            indexer: None,
            flags: Vec::new(),
            description: None,
            genre: None,
            poster: None,
        }
    }
}
