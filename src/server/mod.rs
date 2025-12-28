//! Server module - Web API and static file serving
//!
//! This module provides the HTTP server for Lodestarr, handling:
//! - Static file serving for the web UI
//! - RESTful API endpoints for indexer management
//! - Torznab API compatibility
//! - Native indexer operations

mod api_indexers;
mod api_info;
mod api_native;
mod api_settings;
mod static_files;

use crate::config::Config;
use crate::indexer::{IndexerDownloader, IndexerManager};
use axum::{Router, routing::get};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::RwLock;
use tower_http::trace::TraceLayer;

// Handlers are used directly via module paths (e.g., api_info::api_info)
use api_indexers::*;
use api_info::{api_info, get_history, get_history_results, get_stats};
use api_native::*;
use api_settings::*;
use static_files::static_handler;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<Config>>,
    pub start_time: SystemTime,
    pub native_indexers: Arc<RwLock<IndexerManager>>,
    pub db_pool: crate::db::DbPool,
    /// Cached list of available indexers from GitHub (loaded at startup, refreshed on demand)
    pub cached_github_indexers: Arc<RwLock<Vec<crate::indexer::AvailableIndexer>>>,
}

/// Start the web server
pub async fn start_server(config: Config, host: &str, port: u16) -> anyhow::Result<()> {
    // Initialize native indexer manager
    let proxy_url = config.proxy_url.as_deref();
    let native_manager = IndexerManager::new(proxy_url);

    // Use new directory structure: active/native/ for installed indexers
    let active_native_path = config.get_active_native_path()?;
    std::fs::create_dir_all(&active_native_path)?;
    tracing::info!("Using native indexers directory: {:?}", active_native_path);
    if active_native_path.exists()
        && let Err(e) = native_manager.load_definitions(&active_native_path).await
    {
        tracing::warn!("Failed to load native indexers: {}", e);
    }

    let db_path = config.get_db_path()?;
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    tracing::info!("Using database at: {:?}", db_path);

    // Setup downloader with available directory for cached indexer YML files
    let available_path = config.get_available_indexers_path()?;
    std::fs::create_dir_all(&available_path)?;
    let available_path_str = available_path.to_string_lossy().to_string();
    let downloader = IndexerDownloader::with_available_dir(
        active_native_path.to_string_lossy().to_string(),
        config.proxy_url.clone(),
        Some(available_path_str.clone()),
    );

    // Check if we have locally downloaded indexers, or fetch the list from GitHub
    let available_local = downloader.list_available_local().await.unwrap_or_default();
    let github_indexers = if available_local.is_empty() {
        // No local cache, fetch list from GitHub (but don't download files yet)
        match downloader.list_available().await {
            Ok(indexers) => {
                tracing::info!("Fetched {} available indexers from GitHub", indexers.len());
                indexers
            }
            Err(e) => {
                tracing::warn!("Failed to fetch GitHub indexers at startup: {}", e);
                Vec::new()
            }
        }
    } else {
        // Build list from locally cached YML files
        tracing::info!(
            "Loaded {} available indexers from local cache",
            available_local.len()
        );
        available_local
            .iter()
            .map(|name| crate::indexer::AvailableIndexer {
                name: name.clone(),
                filename: format!("{}.yml", name),
                download_url: String::new(), // Not needed for local files
            })
            .collect()
    };

    let db_pool = crate::db::init_db(db_path);

    // Clean up expired cache entries at startup
    if let Err(e) = crate::db::cleanup_cache(&db_pool) {
        tracing::warn!("Failed to cleanup expired cache: {}", e);
    }

    let state = AppState {
        config: Arc::new(RwLock::new(config)),
        start_time: SystemTime::now(),
        native_indexers: Arc::new(RwLock::new(native_manager)),
        db_pool,
        cached_github_indexers: Arc::new(RwLock::new(github_indexers)),
    };

    let app = Router::new()
        // API Endpoints
        .route("/api/info", get(api_info))
        .route("/api/stats", get(get_stats))
        .route("/api/history", get(get_history))
        .route("/api/history/{key}", get(get_history_results))
        .route("/api/v2.0/indexers", get(list_indexers))
        .route("/api/v2.0/search", get(search_api))
        .route(
            "/api/v2.0/indexers/{indexer}/results/torznab",
            get(torznab_api),
        )
        .route(
            "/api/v2.0/indexers/{indexer}/results/torznab/api",
            get(torznab_api),
        )
        .route("/api/v2.0/indexers/{indexer}/dl", get(proxy_download))
        .route("/api/v2.0/indexers/{indexer}/caps", get(get_indexer_caps))
        // Native indexer endpoints
        .route("/api/native/list", get(list_github_indexers))
        .route(
            "/api/native/refresh",
            axum::routing::post(refresh_github_indexers),
        )
        .route("/api/native/local", get(list_local_indexers))
        .route(
            "/api/native/download",
            axum::routing::post(download_indexers),
        )
        .route(
            "/api/native/delete",
            axum::routing::post(delete_native_indexer),
        )
        .route("/api/native/search", get(search_native))
        .route(
            "/api/native/{id}/settings",
            get(get_native_settings).put(update_native_settings),
        )
        .route(
            "/api/native/{id}/test",
            axum::routing::post(test_native_indexer),
        )
        .route(
            "/api/settings/indexer",
            axum::routing::post(add_indexer_api),
        )
        .route(
            "/api/settings/indexer/test",
            axum::routing::post(test_indexer_api),
        )
        .route(
            "/api/settings/indexer/{name}",
            axum::routing::delete(remove_indexer_api).put(edit_indexer_api),
        )
        .route(
            "/api/settings/download",
            axum::routing::get(get_download_config).post(save_download_config),
        )
        .route(
            "/api/settings/proxy",
            axum::routing::get(get_proxy_config).post(save_proxy_config),
        )
        .route(
            "/api/settings/indexer/{name}/status",
            axum::routing::put(set_indexer_status),
        )
        .route(
            "/api/settings/cache/clear",
            axum::routing::post(clear_cache_api),
        )
        .route(
            "/api/settings/activity/clear",
            axum::routing::post(clear_activity_api),
        )
        .route("/api/download", axum::routing::post(trigger_download))
        .route(
            "/api/torrent/meta",
            axum::routing::post(get_torrent_metadata),
        )
        .with_state(state)
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http());

    let addr = format!("{}:{}", host, port);
    println!("Web UI running at http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

/// Handle graceful shutdown signals
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    println!("Signal received, starting graceful shutdown...");
}
