//! Settings API endpoints

use super::AppState;
use crate::config::Config;
use crate::indexer::IndexerManager;
use crate::torznab::TorznabClient;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

// Helper function to handle config save errors consistently
pub(super) fn save_config_or_error(config: &Config) -> Result<(), (StatusCode, String)> {
    config.save().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save config: {}", e),
        )
    })
}

#[derive(Deserialize)]
pub struct AddIndexerParams {
    pub name: String,
    pub url: String,
    pub apikey: Option<String>,
}

pub(super) async fn add_indexer_api(
    State(state): State<AppState>,
    Json(payload): Json<AddIndexerParams>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;
    config.add_indexer(payload.name, payload.url, payload.apikey);
    if let Err((status, msg)) = save_config_or_error(&config) {
        return (status, msg).into_response();
    }
    (StatusCode::OK, "Indexer added").into_response()
}

pub(super) async fn edit_indexer_api(
    State(state): State<AppState>,
    Path(original_name): Path<String>,
    Json(payload): Json<AddIndexerParams>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;

    // Check if renaming and new name already exists (and isn't self)
    if original_name != payload.name && config.get_indexer(&payload.name).is_some() {
        return (StatusCode::CONFLICT, "Indexer name already exists").into_response();
    }

    // Remove old indexer
    if !config.remove_indexer(&original_name) {
        return (StatusCode::NOT_FOUND, "Indexer not found").into_response();
    }

    // Add updated one
    config.add_indexer(payload.name, payload.url, payload.apikey);
    if let Err((status, msg)) = save_config_or_error(&config) {
        return (status, msg).into_response();
    }
    (StatusCode::OK, "Indexer updated").into_response()
}

pub(super) async fn get_download_config(State(state): State<AppState>) -> Json<serde_json::Value> {
    let config = state.config.read().await;
    Json(serde_json::json!({ "path": config.download_path }))
}

#[derive(Deserialize)]
pub(super) struct DownloadConfigParams {
    path: String,
}

pub(super) async fn save_download_config(
    State(state): State<AppState>,
    Json(payload): Json<DownloadConfigParams>,
) -> impl IntoResponse {
    if !payload.path.is_empty()
        && let Err(e) = std::fs::create_dir_all(&payload.path)
    {
        return (
            StatusCode::BAD_REQUEST,
            format!("Invalid download path: {}", e),
        )
            .into_response();
    }

    let mut config = state.config.write().await;
    config.download_path = if payload.path.is_empty() {
        None
    } else {
        Some(payload.path)
    };
    if let Err((status, msg)) = save_config_or_error(&config) {
        return (status, msg).into_response();
    }
    (StatusCode::OK, "Download path saved").into_response()
}

pub(super) async fn get_proxy_config(State(state): State<AppState>) -> Json<serde_json::Value> {
    let config = state.config.read().await;
    Json(serde_json::json!({ "proxy_url": config.proxy_url }))
}

#[derive(Deserialize)]
pub(super) struct ProxyConfigParams {
    proxy_url: Option<String>,
}

pub(super) async fn save_proxy_config(
    State(state): State<AppState>,
    Json(payload): Json<ProxyConfigParams>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;

    // Normalize empty string to None
    config.proxy_url = payload.proxy_url.filter(|s| !s.is_empty());
    if let Err((status, msg)) = save_config_or_error(&config) {
        return (status, msg).into_response();
    }

    let proxy_url = config.proxy_url.as_deref();
    let mut manager = state.native_indexers.write().await;

    let new_manager = IndexerManager::new(proxy_url);
    if let Ok(active_native_path) = config.get_active_native_path()
        && active_native_path.exists()
    {
        let _ = new_manager.load_definitions(&active_native_path).await;
    }
    *manager = new_manager;

    (StatusCode::OK, "Proxy settings saved").into_response()
}

#[derive(Deserialize)]
pub(super) struct IndexerStatusParams {
    enabled: bool,
}

pub(super) async fn set_indexer_status(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(payload): Json<IndexerStatusParams>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;
    config.set_enabled(&name, payload.enabled);
    if let Err((status, msg)) = save_config_or_error(&config) {
        return (status, msg).into_response();
    }
    (StatusCode::OK, "Status updated").into_response()
}

#[derive(Serialize)]
pub(super) struct ClearCacheResponse {
    deleted: usize,
}

pub(super) async fn clear_cache_api(State(state): State<AppState>) -> impl IntoResponse {
    match crate::db::clear_all_cache(&state.db_pool) {
        Ok(deleted) => Json(ClearCacheResponse { deleted }).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to clear cache: {}", e),
        )
            .into_response(),
    }
}

pub(super) async fn clear_activity_api(State(state): State<AppState>) -> impl IntoResponse {
    match crate::db::clear_search_logs(&state.db_pool) {
        Ok(deleted) => Json(ClearCacheResponse { deleted }).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to clear activity: {}", e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub(super) struct TriggerDownloadParams {
    url: String,
    title: Option<String>,
}

pub(super) async fn trigger_download(
    State(state): State<AppState>,
    Json(payload): Json<TriggerDownloadParams>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let path = match &config.download_path {
        Some(p) => p.clone(),
        None => return (StatusCode::BAD_REQUEST, "No download path configured").into_response(),
    };

    let proxy_url = config.proxy_url.as_deref();
    let client = match TorznabClient::new("http://localhost", None, proxy_url) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Client init failed: {}", e),
            )
                .into_response();
        }
    };

    match crate::download::perform_download(
        &client,
        &payload.url,
        Some(path),
        false,
        payload.title.as_deref(),
    )
    .await
    {
        Ok(_) => (StatusCode::OK, "Download started").into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Download failed: {}", e),
        )
            .into_response(),
    }
}

pub(super) async fn test_indexer_api(
    State(state): State<AppState>,
    Json(payload): Json<AddIndexerParams>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let proxy_url = config.proxy_url.as_deref();

    let client = match TorznabClient::new(&payload.url, payload.apikey.as_deref(), proxy_url) {
        Ok(c) => c,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("Invalid URL: {}", e)).into_response(),
    };

    match client.get_caps().await {
        Ok(_) => (StatusCode::OK, "Connection successful").into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, format!("Connection failed: {}", e)).into_response(),
    }
}

pub(super) async fn remove_indexer_api(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;
    if config.remove_indexer(&name) {
        if let Err((status, msg)) = save_config_or_error(&config) {
            return (status, msg).into_response();
        }
        (StatusCode::OK, "Indexer removed").into_response()
    } else {
        (StatusCode::NOT_FOUND, "Indexer not found").into_response()
    }
}

// Torrent metadata structures
#[derive(Deserialize)]
pub(super) struct TorrentMetaParams {
    url: String,
}

#[derive(Serialize)]
pub(super) struct TorrentFileInfo {
    path: String,
    size: u64,
}

#[derive(Serialize)]
pub(super) struct TorrentMetadataResponse {
    name: String,
    info_hash: String,
    total_size: u64,
    piece_length: u64,
    files: Vec<TorrentFileInfo>,
    trackers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    creation_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    comment: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct TorrentInfo {
    name: Option<String>,
    #[serde(rename = "piece length")]
    piece_length: Option<u64>,
    length: Option<u64>,
    files: Option<Vec<TorrentFile>>,
    #[serde(skip)]
    #[allow(dead_code)]
    pieces: Option<serde_bytes::ByteBuf>,
}

#[derive(Deserialize, Serialize)]
struct TorrentFile {
    length: u64,
    path: Vec<String>,
}

#[derive(Deserialize)]
struct TorrentData {
    info: TorrentInfo,
    announce: Option<String>,
    #[serde(rename = "announce-list")]
    announce_list: Option<Vec<Vec<String>>>,
    #[serde(rename = "created by")]
    created_by: Option<String>,
    #[serde(rename = "creation date")]
    creation_date: Option<i64>,
    comment: Option<String>,
}

pub(super) async fn get_torrent_metadata(
    State(state): State<AppState>,
    Json(payload): Json<TorrentMetaParams>,
) -> impl IntoResponse {
    // Fetch the torrent file
    let proxy_url = {
        let config = state.config.read().await;
        config.proxy_url.clone()
    };

    let client = match TorznabClient::new("http://localhost", None, proxy_url.as_deref()) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create client: {}", e),
            )
                .into_response();
        }
    };

    // Build full URL
    let full_url = if payload.url.starts_with("http") {
        payload.url.clone()
    } else {
        format!("http://localhost:3420{}", payload.url)
    };

    // Download the torrent file
    let bytes = match client.download(&full_url).await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                format!("Failed to fetch torrent: {}", e),
            )
                .into_response();
        }
    };

    // Parse bencode
    let torrent: TorrentData = match serde_bencode::from_bytes(&bytes) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to parse torrent: {}", e),
            )
                .into_response();
        }
    };

    // Calculate info hash
    let info_bytes = match serde_bencode::to_bytes(&torrent.info) {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to re-encode info dict".to_string(),
            )
                .into_response();
        }
    };

    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(&info_bytes);
    let result = hasher.finalize();
    let info_hash = hex::encode(result);

    // Extract files
    let (files, total_size) = if let Some(file_list) = torrent.info.files {
        let mut total = 0u64;
        let files: Vec<TorrentFileInfo> = file_list
            .iter()
            .map(|f| {
                total += f.length;
                TorrentFileInfo {
                    path: f.path.join("/"),
                    size: f.length,
                }
            })
            .collect();
        (files, total)
    } else {
        // Single file torrent
        let size = torrent.info.length.unwrap_or(0);
        let name = torrent.info.name.clone().unwrap_or_default();
        (vec![TorrentFileInfo { path: name, size }], size)
    };

    // Extract trackers
    let mut trackers: Vec<String> = Vec::new();
    if let Some(announce) = torrent.announce {
        trackers.push(announce);
    }
    if let Some(announce_list) = torrent.announce_list {
        for tier in announce_list {
            for tracker in tier {
                if !trackers.contains(&tracker) {
                    trackers.push(tracker);
                }
            }
        }
    }

    // Format creation date
    let creation_date = torrent.creation_date.map(|ts| {
        chrono::DateTime::from_timestamp(ts, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| ts.to_string())
    });

    let response = TorrentMetadataResponse {
        name: torrent.info.name.unwrap_or_default(),
        info_hash,
        total_size,
        piece_length: torrent.info.piece_length.unwrap_or(0),
        files,
        trackers,
        created_by: torrent.created_by,
        creation_date,
        comment: torrent.comment,
    };

    Json(response).into_response()
}
