use crate::config::Config;
use crate::torznab::{SearchParams, TorrentResult, TorznabClient};
use axum::http::Uri;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use futures::future::join_all;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::SystemTime;
use tokio::sync::RwLock;
use tower_http::trace::TraceLayer;
#[derive(RustEmbed)]
#[folder = "web/dist"]
struct Assets;

#[derive(Clone, Serialize)]
pub struct SearchLog {
    pub query: String,
    pub indexer: String, // "all" or specific
    pub timestamp: SystemTime,
    pub result_count: usize,
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<Config>>,
    pub start_time: SystemTime,
    pub total_searches: Arc<AtomicUsize>,
    pub recent_searches: Arc<RwLock<VecDeque<SearchLog>>>,
}

pub async fn start_server(config: Config, host: &str, port: u16) -> anyhow::Result<()> {
    let state = AppState {
        config: Arc::new(RwLock::new(config)),
        start_time: SystemTime::now(),
        total_searches: Arc::new(AtomicUsize::new(0)),
        recent_searches: Arc::new(RwLock::new(VecDeque::with_capacity(50))),
    };

    let app = Router::new()
        // API Endpoints
        .route("/api/info", get(api_info))
        .route("/api/stats", get(get_stats))
        .route("/api/v2.0/indexers", get(list_indexers))
        .route("/api/v2.0/search", get(search_api))
        .route("/api/v2.0/indexers/{indexer}/dl", get(proxy_download))
        .route("/api/v2.0/indexers/{indexer}/caps", get(get_indexer_caps))
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
        .route("/api/download", axum::routing::post(trigger_download))
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

async fn api_info() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "Lodestarr",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[derive(Serialize)]
struct StatsResponse {
    indexers_loaded: usize,
    indexers_healthy: usize, // Placeholder for now
    uptime_seconds: u64,
    total_searches: usize,
    recent_searches: Vec<SearchLog>,
}

async fn get_stats(State(state): State<AppState>) -> Json<StatsResponse> {
    let config = state.config.read().await;
    let indexers_count = config.indexers.len();

    let uptime = SystemTime::now()
        .duration_since(state.start_time)
        .unwrap_or_default()
        .as_secs();

    let searches = state.total_searches.load(Ordering::Relaxed);
    let recent = state.recent_searches.read().await.iter().cloned().collect();

    Json(StatsResponse {
        indexers_loaded: indexers_count,
        indexers_healthy: indexers_count, // Assuming all healthy for now
        uptime_seconds: uptime,
        total_searches: searches,
        recent_searches: recent,
    })
}

#[derive(Serialize)]
struct IndexerDefinition {
    id: String,
    name: String,
    url: String,
}

#[derive(Serialize)]
struct IndexerListResponse {
    indexers: Vec<IndexerDefinition>,
}

async fn list_indexers(State(state): State<AppState>) -> Json<IndexerListResponse> {
    let config = state.config.read().await;
    let indexers = config
        .indexers
        .iter()
        .map(|idx| IndexerDefinition {
            id: idx.name.clone(),
            name: idx.name.clone(),
            url: idx.url.clone(),
        })
        .collect();

    Json(IndexerListResponse { indexers })
}

#[derive(Deserialize)]
struct AddIndexerParams {
    name: String,
    url: String,
    apikey: Option<String>,
}

async fn add_indexer_api(
    State(state): State<AppState>,
    Json(payload): Json<AddIndexerParams>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;
    config.add_indexer(payload.name, payload.url, payload.apikey);
    if let Err(e) = config.save() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save config: {}", e),
        )
            .into_response();
    }
    (StatusCode::OK, "Indexer added").into_response()
}

async fn edit_indexer_api(
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

    if let Err(e) = config.save() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save config: {}", e),
        )
            .into_response();
    }
    (StatusCode::OK, "Indexer updated").into_response()
}

async fn get_download_config(State(state): State<AppState>) -> Json<serde_json::Value> {
    let config = state.config.read().await;
    Json(serde_json::json!({ "path": config.download_path }))
}

#[derive(Deserialize)]
struct DownloadConfigParams {
    path: String,
}

async fn save_download_config(
    State(state): State<AppState>,
    Json(payload): Json<DownloadConfigParams>,
) -> impl IntoResponse {
    if !payload.path.is_empty() {
        if let Err(e) = std::fs::create_dir_all(&payload.path) {
            return (
                StatusCode::BAD_REQUEST,
                format!("Invalid download path: {}", e),
            )
                .into_response();
        }
    }

    let mut config = state.config.write().await;
    config.download_path = if payload.path.is_empty() {
        None
    } else {
        Some(payload.path)
    };

    if let Err(e) = config.save() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save config: {}", e),
        )
            .into_response();
    }
    (StatusCode::OK, "Download path saved").into_response()
}

#[derive(Deserialize)]
struct TriggerDownloadParams {
    url: String,
    title: Option<String>,
}

async fn trigger_download(
    State(state): State<AppState>,
    Json(payload): Json<TriggerDownloadParams>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let path = match &config.download_path {
        Some(p) => p.clone(),
        None => return (StatusCode::BAD_REQUEST, "No download path configured").into_response(),
    };

    // Need a dummy client just for the download method?
    // Actually perform_download takes a client. We can use a temporary one or one from cache.
    // Ideally we reuse one. Let's create a temporary one for the download since we don't know which indexer it came from in this payload context easily unless we pass it.
    // For now, let's create a generic client.
    let client = match TorznabClient::new("http://localhost", None) {
        // Base URL doesn't matter for direct download
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Client init failed: {}", e),
            )
                .into_response()
        }
    };

    // perform_download is async
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

async fn test_indexer_api(Json(payload): Json<AddIndexerParams>) -> impl IntoResponse {
    let client = match TorznabClient::new(&payload.url, payload.apikey.as_deref()) {
        Ok(c) => c,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("Invalid URL: {}", e)).into_response(),
    };

    match client.get_caps().await {
        Ok(_) => (StatusCode::OK, "Connection successful").into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, format!("Connection failed: {}", e)).into_response(),
    }
}

async fn remove_indexer_api(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let mut config = state.config.write().await;
    if config.remove_indexer(&name) {
        if let Err(e) = config.save() {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to save config: {}", e),
            )
                .into_response();
        }
        (StatusCode::OK, "Indexer removed").into_response()
    } else {
        (StatusCode::NOT_FOUND, "Indexer not found").into_response()
    }
}

async fn get_indexer_caps(
    State(state): State<AppState>,
    Path(indexer): Path<String>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let client = if let Some(idx) = config.get_indexer(&indexer) {
        TorznabClient::new(&idx.url, idx.apikey.as_deref()).ok()
    } else {
        None
    };

    if let Some(client) = client {
        match client.get_caps().await {
            Ok(caps) => Json(caps).into_response(),
            Err(e) => (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
        }
    } else {
        (StatusCode::NOT_FOUND, "Indexer not found").into_response()
    }
}

#[derive(Deserialize)]
struct SearchApiParams {
    q: String,
    indexer: Option<String>,
    cat: Option<String>,
}

async fn search_api(
    State(state): State<AppState>,
    Query(params): Query<SearchApiParams>,
) -> impl IntoResponse {
    state.total_searches.fetch_add(1, Ordering::Relaxed);

    let config = state.config.read().await;

    // Determine clients to query
    let mut clients = Vec::new();
    let target = params.indexer.as_deref().unwrap_or("all");

    if target == "all" {
        for idx in &config.indexers {
            if let Ok(client) = TorznabClient::new(&idx.url, idx.apikey.as_deref()) {
                clients.push((idx.name.clone(), client));
            }
        }
    } else if let Some(idx) = config.get_indexer(target) {
        if let Ok(client) = TorznabClient::new(&idx.url, idx.apikey.as_deref()) {
            clients.push((idx.name.clone(), client));
        }
    }

    let search_params = SearchParams {
        query: params.q.clone(),
        search_type: "search".to_string(),
        cat: params.cat.clone(),
        season: None,
        ep: None,
        imdbid: None,
        tmdbid: None,
        tvdbid: None,
        year: None,
        limit: Some(100),
    };

    let futures = clients.iter().map(|(name, client)| {
        let p = search_params.clone();
        let n = name.clone();
        async move {
            match client.search(&p).await {
                Ok(mut res) => {
                    for r in &mut res {
                        r.indexer = Some(n.clone());
                    }
                    Ok::<Vec<TorrentResult>, anyhow::Error>(res)
                }
                Err(_) => Ok(vec![]), // Ignore errors for now in web UI aggregation
            }
        }
    });

    let results_lists: Vec<Result<Vec<TorrentResult>, _>> = join_all(futures).await;
    let mut all_results = Vec::new();
    for list in results_lists.into_iter().flatten() {
        all_results.extend(list);
    }

    // Record stat
    {
        let mut recent = state.recent_searches.write().await;
        if recent.len() >= 20 {
            recent.pop_back();
        }
        recent.push_front(SearchLog {
            query: params.q,
            indexer: target.to_string(),
            timestamp: SystemTime::now(),
            result_count: all_results.len(),
        });
    }

    // Sort by seeders
    all_results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0)));

    Json(all_results).into_response()
}

#[derive(Deserialize)]
struct DownloadParams {
    link: String,
}

async fn proxy_download(
    State(state): State<AppState>,
    Path(indexer): Path<String>, // We might need this to pick the right client?
    Query(params): Query<DownloadParams>,
) -> impl IntoResponse {
    if params.link.starts_with("magnet:") {
        return (
            StatusCode::TEMPORARY_REDIRECT,
            [(axum::http::header::LOCATION, params.link)],
        )
            .into_response();
    }

    let config = state.config.read().await;

    let client = if let Some(idx) = config.get_indexer(&indexer) {
        TorznabClient::new(&idx.url, idx.apikey.as_deref()).ok()
    } else {
        None
    };

    if let Some(client) = client {
        match client.download(&params.link).await {
            Ok(bytes) => {
                let mut headers = axum::http::HeaderMap::new();
                headers.insert(
                    axum::http::header::CONTENT_TYPE,
                    "application/x-bittorrent".parse().unwrap(),
                );
                headers.insert(
                    axum::http::header::CONTENT_DISPOSITION,
                    "attachment; filename=\"download.torrent\"".parse().unwrap(),
                );
                (headers, bytes).into_response()
            }
            Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
        }
    } else {
        (StatusCode::NOT_FOUND, "Indexer not found or invalid").into_response()
    }
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();

    if path.is_empty() {
        path = "index.html".to_string();
    }

    match Assets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            (
                [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                content.data,
            )
                .into_response()
        }
        None => {
            if path.contains('.') {
                return StatusCode::NOT_FOUND.into_response();
            }
            // Fallback to index.html for SPA routing
            match Assets::get("index.html") {
                Some(content) => {
                    let mime = mime_guess::from_path("index.html").first_or_octet_stream();
                    (
                        [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                        content.data,
                    )
                        .into_response()
                }
                None => StatusCode::NOT_FOUND.into_response(),
            }
        }
    }
}

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
