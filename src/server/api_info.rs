//! Info and statistics API endpoints

use super::AppState;
use axum::{Json, extract::State};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::time::SystemTime;

#[derive(Serialize)]
pub(super) struct SearchLog {
    query: String,
    indexer: String,
    timestamp: DateTime<Utc>,
    result_count: usize,
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

    let recent_db = crate::db::get_recent_logs(&state.db_pool, 20).unwrap_or_default();
    let recent = recent_db
        .into_iter()
        .map(|l| SearchLog {
            query: l.query,
            indexer: l.indexer,
            timestamp: l.timestamp,
            result_count: l.result_count,
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
