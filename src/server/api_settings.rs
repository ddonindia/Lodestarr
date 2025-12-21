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
