//! Info and statistics API endpoints

use super::AppState;
use axum::{Json, extract::State, response::IntoResponse};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::time::SystemTime;

#[derive(Serialize)]
pub(super) struct SearchLog {
    id: i64,
    query: String,
    indexer: String,
    timestamp: DateTime<Utc>,
    result_count: usize,
    has_results: bool,
}

#[derive(Serialize)]
pub(super) struct StatsResponse {
    indexers_loaded: usize,
    indexers_healthy: usize,
    indexers_native: usize,
    indexers_proxied: usize,
    indexers_enabled: usize,
    uptime_seconds: u64,
    total_searches: usize,
    avg_search_time_ms: f64,
    recent_searches: Vec<SearchLog>,
}

#[derive(Serialize)]
pub(super) struct HistoryResponse {
    results: Vec<SearchLog>,
    total: usize,
}

#[derive(serde::Deserialize)]
pub(super) struct HistoryParams {
    q: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

/// Get application info (name, version)
pub(super) async fn api_info() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "Lodestarr",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// Get application statistics
pub(super) async fn get_stats(State(state): State<AppState>) -> Json<StatsResponse> {
    let config = state.config.read().await;
    let indexers_proxied = config.indexers.len();

    let native_manager = state.native_indexers.read().await;
    let indexers_native = native_manager.list_all_definitions().await.len();

    // Count total enabled indexers (including native ones)
    let enabled_proxied = config
        .indexers
        .iter()
        .filter(|i| config.is_enabled(&i.name))
        .count();
    // For native indexers, enabled state is also in config (using their ID)
    let native_defs = native_manager.list_all_definitions().await;
    let enabled_native = native_defs
        .iter()
        .filter(|d| config.is_enabled(&d.id))
        .count();

    let indexers_enabled = enabled_proxied + enabled_native;

    let uptime = SystemTime::now()
        .duration_since(state.start_time)
        .unwrap_or_default()
        .as_secs();

    let total_searches = crate::db::get_total_searches(&state.db_pool).unwrap_or(0);
    let avg_search_time_ms = crate::db::get_avg_duration(&state.db_pool).unwrap_or(0.0);

    let (recent_db, _) =
        crate::db::get_recent_logs(&state.db_pool, None, 20, 0).unwrap_or_default();
    let recent = recent_db
        .into_iter()
        .map(|l| SearchLog {
            id: l.id,
            query: l.query,
            indexer: l.indexer,
            timestamp: l.timestamp,
            result_count: l.result_count,
            has_results: l.has_results,
        })
        .collect();

    Json(StatsResponse {
        indexers_loaded: indexers_proxied + indexers_native,
        indexers_healthy: indexers_proxied + indexers_native,
        indexers_native,
        indexers_proxied,
        indexers_enabled,
        uptime_seconds: uptime,
        total_searches,
        avg_search_time_ms,
        recent_searches: recent,
    })
}

/// Get list of recent searches (persistent, from search_logs)
pub(super) async fn get_history(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HistoryParams>,
) -> Json<HistoryResponse> {
    let (recent, total) = crate::db::get_recent_logs(
        &state.db_pool,
        params.q,
        params.limit.unwrap_or(50),
        params.offset.unwrap_or(0),
    )
    .unwrap_or_default();

    let results = recent
        .into_iter()
        .map(|l| SearchLog {
            id: l.id,
            query: l.query,
            indexer: l.indexer,
            timestamp: l.timestamp,
            result_count: l.result_count,
            has_results: l.has_results,
        })
        .collect();

    Json(HistoryResponse { results, total })
}

/// Get cached results by search log ID
pub(super) async fn get_history_results(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> impl axum::response::IntoResponse {
    match crate::db::get_search_log_results(&state.db_pool, id) {
        Ok(Some(results_json)) => (
            axum::http::StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            results_json,
        )
            .into_response(),
        Ok(None) => (
            axum::http::StatusCode::NOT_FOUND,
            "Results not found for this search",
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error: {}", e),
        )
            .into_response(),
    }
}

/// Get download history
pub(super) async fn get_downloads(
    State(state): State<AppState>,
) -> Json<Vec<crate::db::DownloadLog>> {
    let downloads = crate::db::get_download_logs(&state.db_pool, 500).unwrap_or_default();
    Json(downloads)
}

/// Get list of downloaded magnet/links for marking items in UI
pub(super) async fn get_downloaded_links(State(state): State<AppState>) -> Json<Vec<String>> {
    let links = crate::db::get_downloaded_links(&state.db_pool).unwrap_or_default();
    Json(links)
}

/// Clear download history
pub(super) async fn clear_downloads(State(state): State<AppState>) -> impl IntoResponse {
    match crate::db::clear_download_logs(&state.db_pool) {
        Ok(count) => (
            axum::http::StatusCode::OK,
            format!("Cleared {} download logs", count),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to clear: {}", e),
        )
            .into_response(),
    }
}

/// Clear search stats/logs
pub(super) async fn clear_stats(State(state): State<AppState>) -> impl IntoResponse {
    match crate::db::clear_search_logs(&state.db_pool) {
        Ok(count) => (
            axum::http::StatusCode::OK,
            format!("Cleared {} search logs", count),
        )
            .into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to clear: {}", e),
        )
            .into_response(),
    }
}

/// Clear all data (stats + downloads + cache)
pub(super) async fn clear_all(State(state): State<AppState>) -> impl IntoResponse {
    let mut cleared = Vec::new();

    if let Ok(n) = crate::db::clear_search_logs(&state.db_pool) {
        cleared.push(format!("{} search logs", n));
    }
    if let Ok(n) = crate::db::clear_download_logs(&state.db_pool) {
        cleared.push(format!("{} downloads", n));
    }
    if let Ok(n) = crate::db::clear_all_cache(&state.db_pool) {
        cleared.push(format!("{} cached searches", n));
    }

    (
        axum::http::StatusCode::OK,
        format!("Cleared: {}", cleared.join(", ")),
    )
        .into_response()
}

pub(super) async fn get_logs(State(state): State<AppState>) -> impl IntoResponse {
    if let Some(ref buffer) = state.log_buffer {
        let logs = buffer.get_logs();
        Json(logs).into_response()
    } else {
        (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "Log buffer not enabled",
        )
            .into_response()
    }
}

pub(super) async fn check_update(State(state): State<AppState>) -> impl IntoResponse {
    match state.update_checker.check_for_updates().await {
        Ok(info) => Json(info).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Update check failed: {}", e),
        )
            .into_response(),
    }
}
