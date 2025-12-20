//! Native indexer API endpoints

use super::AppState;
use crate::indexer::{IndexerDownloader, SearchExecutor};
use crate::models::SearchQuery;
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use futures::stream::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub(super) struct GithubIndexerInfo {
    name: String,
    installed: bool,
}

#[derive(Serialize)]
pub(super) struct GithubIndexerListResponse {
    indexers: Vec<GithubIndexerInfo>,
    total: usize,
}

pub(super) async fn list_github_indexers(State(state): State<AppState>) -> impl IntoResponse {
    let config = state.config.read().await;
    let active_native_path = config
        .get_active_native_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "indexers".to_string());
    let downloader = IndexerDownloader::new(active_native_path, config.proxy_url.clone());

    // Use cached GitHub indexers instead of fetching every time
    let cached = state.cached_github_indexers.read().await;
    let local = downloader.list_local_indexers().await.unwrap_or_default();

    let indexers: Vec<GithubIndexerInfo> = cached
        .iter()
        .map(|indexer| GithubIndexerInfo {
            name: indexer.name.clone(),
            installed: local.contains(&indexer.name),
        })
        .collect();
    let total = indexers.len();
    Json(GithubIndexerListResponse { indexers, total }).into_response()
}

/// Manually refresh the cached GitHub indexers - downloads all YML files to available/
pub(super) async fn refresh_github_indexers(State(state): State<AppState>) -> impl IntoResponse {
    let config = state.config.read().await;
    let available_path = config
        .get_available_indexers_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "indexers/available".to_string());
    let active_native_path = config
        .get_active_native_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "indexers".to_string());
    let downloader = IndexerDownloader::with_available_dir(
        active_native_path,
        config.proxy_url.clone(),
        Some(available_path),
    );
    drop(config); // Release read lock before acquiring write lock

    // Download all indexer YML files to available directory
    match downloader.download_all_to_available().await {
        Ok(count) => {
            // Rebuild the in-memory cache from local files
            let available_local = downloader.list_available_local().await.unwrap_or_default();
            let indexers: Vec<crate::indexer::AvailableIndexer> = available_local
                .iter()
                .map(|name| crate::indexer::AvailableIndexer {
                    name: name.clone(),
                    filename: format!("{}.yml", name),
                    download_url: String::new(),
                })
                .collect();

            let mut cached = state.cached_github_indexers.write().await;
            *cached = indexers;
            tracing::info!("Refreshed GitHub indexers: downloaded {} files", count);
            (
                StatusCode::OK,
                format!("Downloaded {} indexer definitions", count),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Failed to download indexers: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to download from GitHub: {}", e),
            )
                .into_response()
        }
    }
}

#[derive(Serialize)]
pub(super) struct LocalIndexerInfo {
    id: String,
    name: String,
    description: String,
    language: String,
    indexer_type: String,
    links: Vec<String>,
    legacylinks: Vec<String>,
    categories: Vec<i32>,
    enabled: bool,
}

#[derive(Serialize)]
pub(super) struct LocalIndexerListResponse {
    indexers: Vec<LocalIndexerInfo>,
    total: usize,
}

pub(super) async fn list_local_indexers(
    State(state): State<AppState>,
) -> Json<LocalIndexerListResponse> {
    let manager = state.native_indexers.read().await;
    let definitions = manager.list_all_definitions().await;
    let config = state.config.read().await;

    let indexers: Vec<LocalIndexerInfo> = definitions
        .iter()
        .map(|def| LocalIndexerInfo {
            id: def.id.clone(),
            name: def.name.clone(),
            description: def.description.clone(),
            language: def.language.clone(),
            indexer_type: def.indexer_type.clone(),
            links: def.links.clone(),
            legacylinks: def.legacylinks.clone(),
            categories: def.extract_categories(),
            enabled: config.is_enabled(&def.id),
        })
        .collect();

    let total = indexers.len();
    Json(LocalIndexerListResponse { indexers, total })
}

#[derive(Deserialize)]
pub(super) struct DownloadIndexersParams {
    names: Vec<String>,
}

#[derive(Serialize)]
pub(super) struct DownloadResult {
    success: Vec<String>,
    failed: Vec<(String, String)>,
}

pub(super) async fn download_indexers(
    State(state): State<AppState>,
    Json(payload): Json<DownloadIndexersParams>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let proxy_url = config.proxy_url.clone();
    let active_native_path = config
        .get_active_native_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "indexers".to_string());
    // Create the indexers directory if it doesn't exist
    if let Err(e) = std::fs::create_dir_all(&active_native_path) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create indexers directory: {}", e),
        )
            .into_response();
    }
    let downloader = IndexerDownloader::new(active_native_path.clone(), proxy_url);

    // Use download_by_names which handles the lookup
    match downloader.download_by_names(&payload.names).await {
        Ok(results) => {
            let mut success = Vec::new();
            let mut failed = Vec::new();

            for (name, result) in results {
                match result {
                    Ok(_) => success.push(name),
                    Err(e) => failed.push((name, e.to_string())),
                }
            }

            // Reload indexers after download
            if !success.is_empty() {
                let manager = state.native_indexers.write().await;
                let path = std::path::Path::new(&active_native_path);
                let _ = manager.load_definitions(path).await;
            }

            Json(DownloadResult { success, failed }).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Download failed: {}", e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub(super) struct DeleteNativeParams {
    name: String,
}

/// Delete a native indexer from active/native/
pub(super) async fn delete_native_indexer(
    State(state): State<AppState>,
    Json(payload): Json<DeleteNativeParams>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let active_native_path = match config.get_active_native_path() {
        Ok(path) => path,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to get path: {}", e),
            )
                .into_response();
        }
    };
    drop(config);

    let indexer_file = active_native_path.join(format!("{}.yml", payload.name));

    if !indexer_file.exists() {
        return (
            StatusCode::NOT_FOUND,
            format!("Indexer '{}' not found", payload.name),
        )
            .into_response();
    }

    if let Err(e) = std::fs::remove_file(&indexer_file) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete: {}", e),
        )
            .into_response();
    }

    // Reload the indexer manager to reflect the deletion
    let manager = state.native_indexers.write().await;
    let _ = manager.load_definitions(&active_native_path).await;

    tracing::info!("Deleted native indexer: {}", payload.name);
    (
        StatusCode::OK,
        format!("Deleted indexer '{}'", payload.name),
    )
        .into_response()
}

#[derive(Deserialize)]
pub(super) struct NativeSearchParams {
    q: String,
    indexer: Option<String>,
    cat: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub(super) struct NativeSearchResult {
    title: String,
    link: Option<String>,
    magnet: Option<String>,
    size: Option<u64>,
    seeders: Option<u32>,
    leechers: Option<u32>,
    indexer: String,
    indexer_id: String,
    publish_date: Option<DateTime<Utc>>,
    categories: Vec<i32>,
    comments: Option<String>,
    guid: String,
}

pub(super) async fn search_native(
    State(state): State<AppState>,
    Query(params): Query<NativeSearchParams>,
) -> impl IntoResponse {
    let start = std::time::Instant::now();
    let target = params.indexer.as_deref().unwrap_or("all");
    let cache_key = format!(
        "native:{}:{}:{}",
        target,
        params.q,
        params.cat.as_deref().unwrap_or("")
    );

    // Check cache
    if let Ok(Some(cached)) = crate::db::get_cached_results(&state.db_pool, &cache_key)
        && let Ok(results) = serde_json::from_str::<Vec<NativeSearchResult>>(&cached)
    {
        // Log cached search
        let _ = crate::db::log_search(
            &state.db_pool,
            &params.q,
            target,
            results.len(),
            start.elapsed().as_millis(),
        );
        return Json(results).into_response();
    }

    let manager = state.native_indexers.read().await;
    let definitions = manager.list_all_definitions().await;

    if definitions.is_empty() {
        return Json(Vec::<NativeSearchResult>::new()).into_response();
    }

    let mut all_results = Vec::new();

    // Determine which indexers to search
    let indexers_to_search: Vec<_> = if let Some(ref target) = params.indexer {
        definitions
            .into_iter()
            .filter(|d| &d.id == target)
            .collect()
    } else {
        definitions
    };

    let config = state.config.read().await;
    let indexers_to_search = indexers_to_search
        .into_iter()
        .filter(|d| config.is_enabled(&d.id))
        .collect::<Vec<_>>();

    let categories: Vec<i32> = params
        .cat
        .as_deref()
        .map(|s| s.split(',').filter_map(|c| c.parse().ok()).collect())
        .unwrap_or_default();

    let search_query = SearchQuery {
        query: Some(params.q.clone()),
        categories,
        ..Default::default()
    };

    // Get proxy URL for creating executors
    let proxy_url = config.proxy_url.clone();

    let futures = indexers_to_search.into_iter().map(|def| {
        let q = search_query.clone();
        let proxy = proxy_url.clone();
        let settings = config.native_settings.get(&def.id).cloned();
        async move {
            let executor = SearchExecutor::new(proxy.as_deref())
                .unwrap_or_else(|_| SearchExecutor::new(None).expect("Failed to create executor"));
            match executor.search(&def, &q, settings.as_ref()).await {
                Ok(results) => Some((def.id.clone(), def.name.clone(), results)),
                Err(e) => {
                    tracing::warn!("Search failed for {}: {}", def.id, e);
                    None
                }
            }
        }
    });

    let results: Vec<Option<(String, String, Vec<crate::models::TorrentResult>)>> =
        futures::stream::iter(futures)
            .buffer_unordered(4)
            .collect()
            .await;

    for result in results.into_iter().flatten() {
        let (indexer_id, indexer_name, items) = result;
        for r in items {
            all_results.push(NativeSearchResult {
                title: r.title,
                link: r.link,
                magnet: r.magnet,
                size: r.size,
                seeders: r.seeders,
                leechers: r.leechers,
                indexer: indexer_name.clone(),
                indexer_id: indexer_id.clone(),
                publish_date: r.publish_date,
                categories: r.categories,
                comments: r.details,
                guid: r.guid,
            });
        }
    }

    // Sort by seeders
    all_results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0)));

    // Record stat
    let duration = start.elapsed();
    let _ = crate::db::log_search(
        &state.db_pool,
        &params.q,
        target,
        all_results.len(),
        duration.as_millis(),
    );

    // Cache results
    if !all_results.is_empty()
        && let Ok(serialized) = serde_json::to_string(&all_results)
    {
        let _ = crate::db::set_cached_results(&state.db_pool, &cache_key, &serialized, 1);
    }

    Json(all_results).into_response()
}

#[derive(Serialize)]
pub(super) struct NativeSettingsResponse {
    pub settings: Vec<crate::indexer::definition::Setting>,
    pub values: std::collections::HashMap<String, String>,
}

pub(super) async fn get_native_settings(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let manager = state.native_indexers.read().await;
    let def = match manager.get_definition(&id).await {
        Some(d) => d,
        None => return (StatusCode::NOT_FOUND, "Indexer not found").into_response(),
    };

    let config = state.config.read().await;
    let current_values = config
        .native_settings
        .get(&id)
        .cloned()
        .unwrap_or_default();

    Json(NativeSettingsResponse {
        settings: def.settings.clone(),
        values: current_values,
    })
    .into_response()
}

#[derive(Deserialize)]
pub(super) struct UpdateNativeSettingsParams {
    pub settings: std::collections::HashMap<String, String>,
}

pub(super) async fn update_native_settings(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateNativeSettingsParams>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;
    
    config
        .native_settings
        .insert(id.clone(), payload.settings);

    if let Err(e) = config.save() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save config: {}", e),
        )
            .into_response();
    }

    (StatusCode::OK, "Settings saved").into_response()
}

#[derive(Deserialize)]
pub(super) struct TestNativeParams {
    pub query: String,
    pub settings: Option<std::collections::HashMap<String, String>>,
}

pub(super) async fn test_native_indexer(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<TestNativeParams>,
) -> impl IntoResponse {
    let manager = state.native_indexers.read().await;
    let def = match manager.get_definition(&id).await {
        Some(d) => d,
        None => return (StatusCode::NOT_FOUND, "Indexer not found").into_response(),
    };

    let config = state.config.read().await;
    
    // If settings provided in payload (from test form), use them.
    // Otherwise fallback to saved settings.
    let settings_to_use = if payload.settings.is_some() {
        payload.settings
    } else {
        config.native_settings.get(&id).cloned()
    };

    let query = SearchQuery {
        query: Some(payload.query),
        ..Default::default()
    };

    let proxy_url = config.proxy_url.clone();
    let executor = SearchExecutor::new(proxy_url.as_deref())
        .unwrap_or_else(|_| SearchExecutor::new(None).expect("Failed to create executor"));

    match executor.search(&def, &query, settings_to_use.as_ref()).await {
        Ok(results) => Json(results).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, format!("Test failed: {}", e)).into_response(),
    }
}
