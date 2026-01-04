//! Proxied indexer API endpoints (Torznab compatible)

use super::AppState;
use crate::indexer::SearchExecutor;
use crate::models::{SearchQuery, SearchType};
use crate::torznab::{SearchParams, TorrentResult, TorznabClient};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use futures::stream::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub(super) struct IndexerDefinition {
    id: String,
    name: String,
    url: String,
    enabled: bool,
}

#[derive(Serialize)]
pub(super) struct IndexerListResponse {
    indexers: Vec<IndexerDefinition>,
}

pub(super) async fn list_indexers(State(state): State<AppState>) -> Json<IndexerListResponse> {
    let config = state.config.read().await;
    let indexers = config
        .indexers
        .iter()
        .map(|idx| IndexerDefinition {
            id: idx.name.clone(),
            name: idx.name.clone(),
            url: idx.url.clone(),
            enabled: config.is_enabled(&idx.name),
        })
        .collect();

    Json(IndexerListResponse { indexers })
}

pub(super) async fn get_indexer_caps(
    State(state): State<AppState>,
    Path(indexer): Path<String>,
) -> impl IntoResponse {
    let config = state.config.read().await;
    let client = if let Some(idx) = config.get_indexer(&indexer) {
        TorznabClient::new(&idx.url, idx.apikey.as_deref(), config.proxy_url.as_deref()).ok()
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
pub(super) struct SearchApiParams {
    q: String,
    indexer: Option<String>,
    cat: Option<String>,
}

pub(super) async fn search_api(
    State(state): State<AppState>,
    Query(params): Query<SearchApiParams>,
) -> impl IntoResponse {
    let start = std::time::Instant::now();
    let target = params.indexer.as_deref().unwrap_or("all");
    let cache_key = format!(
        "proxied:{}:{}:{}",
        target,
        params.q,
        params.cat.as_deref().unwrap_or("")
    );

    // Check cache
    if let Ok(Some(cached)) = crate::db::get_cached_results(&state.db_pool, &cache_key)
        && let Ok(results) = serde_json::from_str::<Vec<TorrentResult>>(&cached)
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

    let config = state.config.read().await;

    // Determine clients to query
    let mut clients = Vec::new();
    let target = params.indexer.as_deref().unwrap_or("all");

    if target == "all" {
        for idx in &config.indexers {
            if !config.is_enabled(&idx.name) {
                continue;
            }
            if let Ok(client) =
                TorznabClient::new(&idx.url, idx.apikey.as_deref(), config.proxy_url.as_deref())
            {
                clients.push((idx.name.clone(), client));
            }
        }
    } else if let Some(idx) = config.get_indexer(target)
        && config.is_enabled(&idx.name)
        && let Ok(client) =
            TorznabClient::new(&idx.url, idx.apikey.as_deref(), config.proxy_url.as_deref())
    {
        clients.push((idx.name.clone(), client));
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
        ..Default::default()
    };

    let futures = clients.into_iter().map(|(name, client)| {
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

    let results_lists: Vec<Result<Vec<TorrentResult>, _>> = futures::stream::iter(futures)
        .buffer_unordered(4)
        .collect()
        .await;

    let mut all_results = Vec::new();
    for list in results_lists.into_iter().flatten() {
        all_results.extend(list);
    }

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

    // Sort by seeders
    all_results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0)));

    Json(all_results).into_response()
}

#[derive(Deserialize)]
pub(super) struct DownloadParams {
    link: String,
}

pub(super) async fn proxy_download(
    State(state): State<AppState>,
    Path(indexer): Path<String>,
    Query(params): Query<DownloadParams>,
) -> impl IntoResponse {
    // Decode BASE64 URL if it looks encoded (no ":" in the link)
    let download_url = if !params.link.contains(':') {
        // Try to decode as BASE64
        use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
        match URL_SAFE_NO_PAD.decode(&params.link) {
            Ok(bytes) => String::from_utf8(bytes).unwrap_or(params.link.clone()),
            Err(_) => params.link.clone(),
        }
    } else {
        params.link.clone()
    };

    tracing::debug!("Proxy download for indexer '{}': {}", indexer, download_url);

    // Handle magnet links - just redirect
    if download_url.starts_with("magnet:") {
        return (
            StatusCode::TEMPORARY_REDIRECT,
            [(axum::http::header::LOCATION, download_url)],
        )
            .into_response();
    }

    let config = state.config.read().await;

    // First try as a proxied indexer (external Torznab)
    if let Some(idx) = config.get_indexer(&indexer)
        && let Ok(client) =
            TorznabClient::new(&idx.url, idx.apikey.as_deref(), config.proxy_url.as_deref())
    {
        match client.download(&download_url).await {
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
                return (headers, bytes).into_response();
            }
            Err(e) => {
                tracing::warn!("Proxied indexer download failed: {}", e);
            }
        }
    }

    // Try as a native indexer - use a new client with proxy/cookies
    let manager = state.native_indexers.read().await;
    let definitions = manager.list_all_definitions().await;

    // Find the indexer definition to get its base URL
    if let Some(def) = definitions.iter().find(|d| d.id == indexer) {
        // Create SearchExecutor to handle download logic (cookies + multi-step)
        if let Ok(executor) = SearchExecutor::new(config.proxy_url.as_deref()) {
            // Pre-request to acquire cookies if needed
            let _ = executor.visit_base_url(def).await;

            // Execute download
            match executor.download(def, &download_url).await {
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
                    return (headers, axum::body::Body::from(bytes)).into_response();
                }
                Err(e) => {
                    tracing::error!("Native download failed for {}: {}", indexer, e);
                    return (StatusCode::BAD_GATEWAY, format!("Download failed: {}", e))
                        .into_response();
                }
            }
        }
    }

    (
        StatusCode::NOT_FOUND,
        "Indexer not found or download failed",
    )
        .into_response()
}

/// Torznab API query parameters
#[derive(Debug, Deserialize)]
pub struct TorznabParams {
    /// API key
    #[allow(dead_code)]
    pub apikey: Option<String>,
    /// Action type (caps, search, tvsearch, movie, music, book)
    pub t: Option<String>,
    /// Search query
    pub q: Option<String>,
    /// Category filter (comma-separated)
    pub cat: Option<String>,
    /// Limit
    pub limit: Option<u32>,
    /// Offset
    pub offset: Option<u32>,
    /// Season (for tvsearch)
    pub season: Option<u32>,
    /// Episode (for tvsearch)
    pub ep: Option<u32>,
    /// IMDB ID
    pub imdbid: Option<String>,
    /// TVDB ID
    pub tvdbid: Option<i32>,
    /// TMDB ID
    pub tmdbid: Option<i32>,
    /// Year
    pub year: Option<u32>,
    /// Genre
    pub genre: Option<String>,
    /// Album (for music)
    pub album: Option<String>,
    /// Artist (for music)
    pub artist: Option<String>,
    /// Title (for book)
    pub title: Option<String>,
    /// Author (for book)
    pub author: Option<String>,
}

/// Torznab API handler
pub(super) async fn torznab_api(
    State(state): State<AppState>,
    Path(indexer): Path<String>,
    Query(params): Query<TorznabParams>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Extract request base URL for proxy download links
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost:3420");
    let proxy_base_url = format!("http://{}", host);

    // Handle "all" aggregate indexer
    if indexer == "all" {
        return torznab_all_indexers(state, params, &proxy_base_url).await;
    }

    // Get native indexer manager
    let manager = state.native_indexers.read().await;

    // Find indexer definition
    let definitions = manager.list_all_definitions().await;
    let definition = match definitions.into_iter().find(|d| d.id == indexer) {
        Some(d) => d,
        None => {
            return (
                StatusCode::NOT_FOUND,
                [("Content-Type", "application/xml")],
                crate::torznab::generate_error_xml(201, &format!("Indexer not found: {}", indexer)),
            )
                .into_response();
        }
    };

    // Determine action
    let action = params.t.as_deref().unwrap_or("search");

    match action {
        "caps" => {
            // Return capabilities
            let caps = crate::indexer::SearchCapabilities::basic();
            let categories = vec![
                // Console
                1000, 1010, 1020, 1030, 1040, 1050, 1080, 1090, // Movies
                2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080, 2090, // Audio
                3000, 3010, 3020, 3030, 3040, 3050, // PC
                4000, 4010, 4020, 4030, 4050, // TV
                5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060, 5070, 5080, 5090, // XXX
                6000, 6010, 6020, 6030, 6040, 6045, 6050, 6080, 6090, // Books
                7000, 7010, 7020, 7030, 7040, 7050, // Other
                8000, 8010, 8020,
            ];

            (
                StatusCode::OK,
                [("Content-Type", "application/xml")],
                crate::torznab::generate_caps_xml(&definition.name, &categories, &caps),
            )
                .into_response()
        }
        "search" | "tvsearch" | "movie" | "music" | "book" => {
            // Build search query
            let query = SearchQuery {
                search_type: SearchType::from_param(action).unwrap_or_default(),
                query: params.q,
                categories: params
                    .cat
                    .map(|c| c.split(',').filter_map(|s| s.parse().ok()).collect())
                    .unwrap_or_default(),
                limit: params.limit,
                offset: params.offset,
                season: params.season,
                episode: params.ep,
                imdb_id: params.imdbid,
                tvdb_id: params.tvdbid,
                tmdb_id: params.tmdbid,
                year: params.year,
                genre: params.genre,
                album: params.album,
                artist: params.artist,
                title: params.title,
                author: params.author,
                ..Default::default()
            };

            // Execute search with proxy support
            let config = state.config.read().await;
            let settings = config.native_settings.get(&definition.id).cloned();
            let executor = SearchExecutor::new(config.proxy_url.as_deref())
                .unwrap_or_else(|_| SearchExecutor::new(None).expect("Failed to create executor"));
            match executor
                .search(&definition, &query, settings.as_ref())
                .await
            {
                Ok(results) => (
                    StatusCode::OK,
                    [("Content-Type", "application/xml")],
                    crate::torznab::generate_results_xml(
                        &results,
                        &definition.name,
                        Some(&proxy_base_url),
                        Some(&definition.id),
                    ),
                )
                    .into_response(),
                Err(e) => {
                    tracing::error!("Torznab search failed for {}: {}", definition.id, e);
                    (
                        StatusCode::OK, // Return OK with empty results on error for Torznab stability
                        [("Content-Type", "application/xml")],
                        crate::torznab::generate_results_xml(&[], &definition.name, None, None),
                    )
                        .into_response()
                }
            }
        }
        _ => (
            StatusCode::BAD_REQUEST,
            [("Content-Type", "application/xml")],
            crate::torznab::generate_error_xml(202, &format!("Unknown action: {}", action)),
        )
            .into_response(),
    }
}

/// Handle Torznab API for "all" aggregate indexer
async fn torznab_all_indexers(
    state: AppState,
    params: TorznabParams,
    proxy_base_url: &str,
) -> axum::response::Response {
    let action = params.t.as_deref().unwrap_or("search");

    match action {
        "caps" => {
            // Return aggregate capabilities
            let caps = crate::indexer::SearchCapabilities::basic();
            let categories = vec![
                // Console
                1000, 1010, 1020, 1030, 1040, 1050, 1080, 1090, // Movies
                2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080, 2090, // Audio
                3000, 3010, 3020, 3030, 3040, 3050, // PC
                4000, 4010, 4020, 4030, 4050, // TV
                5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060, 5070, 5080, 5090, // XXX
                6000, 6010, 6020, 6030, 6040, 6045, 6050, 6080, 6090, // Books
                7000, 7010, 7020, 7030, 7040, 7050, // Other
                8000, 8010, 8020,
            ];

            (
                StatusCode::OK,
                [("Content-Type", "application/xml")],
                crate::torznab::generate_caps_xml("All Indexers", &categories, &caps),
            )
                .into_response()
        }
        "search" | "tvsearch" | "movie" | "music" | "book" => {
            let config = state.config.read().await;
            let manager = state.native_indexers.read().await;

            // Build search query for native indexers
            let query = SearchQuery {
                search_type: SearchType::from_param(action).unwrap_or_default(),
                query: params.q.clone(),
                categories: params
                    .cat
                    .as_ref()
                    .map(|c| c.split(',').filter_map(|s| s.parse().ok()).collect())
                    .unwrap_or_default(),
                limit: params.limit,
                offset: params.offset,
                season: params.season,
                episode: params.ep,
                imdb_id: params.imdbid.clone(),
                tvdb_id: params.tvdbid,
                tmdb_id: params.tmdbid,
                year: params.year,
                genre: params.genre.clone(),
                album: params.album.clone(),
                artist: params.artist.clone(),
                title: params.title.clone(),
                author: params.author.clone(),
                ..Default::default()
            };

            // Build search params for proxied indexers
            let search_params = SearchParams {
                query: params.q.clone().unwrap_or_default(),
                search_type: action.to_string(),
                cat: params.cat.clone(),
                season: params.season,
                ep: params.ep,
                imdbid: params.imdbid.clone(),
                tmdbid: params.tmdbid,
                tvdbid: params.tvdbid,
                year: params.year,
                limit: params.limit,
                ..Default::default()
            };

            let proxy_base = proxy_base_url.to_string();

            // Collect all search futures
            let mut futures: Vec<
                std::pin::Pin<Box<dyn std::future::Future<Output = Vec<TorrentResult>> + Send>>,
            > = Vec::new();

            // Native indexers
            let definitions = manager.list_all_definitions().await;
            for def in definitions {
                // Check if native indexer is enabled
                if !config.is_enabled(&def.id) {
                    continue;
                }

                let settings = config.native_settings.get(&def.id).cloned();
                let executor = match SearchExecutor::new(config.proxy_url.as_deref()) {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                let q = query.clone();
                let indexer_id = def.id.clone();

                futures.push(Box::pin(async move {
                    match executor.search(&def, &q, settings.as_ref()).await {
                        Ok(mut results) => {
                            for r in &mut results {
                                r.indexer = Some(indexer_id.clone());
                            }
                            results
                        }
                        Err(e) => {
                            tracing::warn!("Native indexer {} search failed: {}", indexer_id, e);
                            vec![]
                        }
                    }
                }));
            }

            // Proxied indexers
            for idx in &config.indexers {
                if !config.is_enabled(&idx.name) {
                    continue;
                }

                let client = match TorznabClient::new(
                    &idx.url,
                    idx.apikey.as_deref(),
                    config.proxy_url.as_deref(),
                ) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                let p = search_params.clone();
                let indexer_name = idx.name.clone();

                futures.push(Box::pin(async move {
                    match client.search(&p).await {
                        Ok(mut results) => {
                            for r in &mut results {
                                r.indexer = Some(indexer_name.clone());
                            }
                            results
                        }
                        Err(e) => {
                            tracing::warn!("Proxied indexer {} search failed: {}", indexer_name, e);
                            vec![]
                        }
                    }
                }));
            }

            // Drop locks before awaiting
            drop(config);
            drop(manager);

            // Execute all searches in parallel
            let results_lists: Vec<Vec<TorrentResult>> = futures::future::join_all(futures).await;

            // Aggregate results
            let mut all_results: Vec<TorrentResult> = results_lists.into_iter().flatten().collect();

            // Sort by seeders (descending)
            all_results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0)));

            // Limit results
            let limit = params.limit.unwrap_or(100) as usize;
            all_results.truncate(limit);

            (
                StatusCode::OK,
                [("Content-Type", "application/xml")],
                crate::torznab::generate_results_xml(
                    &all_results,
                    "All Indexers",
                    Some(&proxy_base),
                    Some("all"),
                ),
            )
                .into_response()
        }
        _ => (
            StatusCode::BAD_REQUEST,
            [("Content-Type", "application/xml")],
            crate::torznab::generate_error_xml(202, &format!("Unknown action: {}", action)),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use crate::torznab::TorrentResult;

    #[test]
    fn test_all_indexers_caps_xml() {
        // Test that capabilities XML is generated correctly for "All Indexers"
        let caps = crate::indexer::SearchCapabilities::basic();
        let categories = vec![2000, 5000]; // Movies and TV

        let xml = crate::torznab::generate_caps_xml("All Indexers", &categories, &caps);

        assert!(xml.contains("Lodestarr - All Indexers"));
        assert!(xml.contains("<search available=\"yes\""));
        assert!(xml.contains("<tv-search available=\"yes\""));
        assert!(xml.contains("<movie-search available=\"yes\""));
        assert!(xml.contains("category id=\"2000\""));
        assert!(xml.contains("category id=\"5000\""));
    }

    #[test]
    fn test_all_indexers_results_xml() {
        // Test that results XML includes indexer field for aggregated results
        let results = vec![
            TorrentResult {
                title: "Test Result 1".to_string(),
                guid: "guid1".to_string(),
                seeders: Some(100),
                indexer: Some("indexer1".to_string()),
                ..Default::default()
            },
            TorrentResult {
                title: "Test Result 2".to_string(),
                guid: "guid2".to_string(),
                seeders: Some(50),
                indexer: Some("indexer2".to_string()),
                ..Default::default()
            },
        ];

        let xml = crate::torznab::generate_results_xml(
            &results,
            "All Indexers",
            Some("http://localhost:3420"),
            Some("all"),
        );

        assert!(xml.contains("<title>All Indexers</title>"));
        assert!(xml.contains("<title>Test Result 1</title>"));
        assert!(xml.contains("<title>Test Result 2</title>"));
        assert!(xml.contains("torznab:attr name=\"seeders\" value=\"100\""));
        assert!(xml.contains("torznab:attr name=\"seeders\" value=\"50\""));
    }

    #[test]
    fn test_all_indexers_results_sorted_by_seeders() {
        // Test that results are sorted by seeders (highest first)
        let mut results = vec![
            TorrentResult {
                title: "Low seeders".to_string(),
                seeders: Some(10),
                ..Default::default()
            },
            TorrentResult {
                title: "High seeders".to_string(),
                seeders: Some(100),
                ..Default::default()
            },
            TorrentResult {
                title: "Medium seeders".to_string(),
                seeders: Some(50),
                ..Default::default()
            },
            TorrentResult {
                title: "No seeders".to_string(),
                seeders: None,
                ..Default::default()
            },
        ];

        // Sort using the same logic as torznab_all_indexers
        results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0)));

        assert_eq!(results[0].title, "High seeders");
        assert_eq!(results[1].title, "Medium seeders");
        assert_eq!(results[2].title, "Low seeders");
        assert_eq!(results[3].title, "No seeders");
    }

    #[test]
    fn test_all_indexers_download_proxy_url() {
        // Test that download URLs are proxied through /api/v2.0/indexers/all/dl
        let results = vec![TorrentResult {
            title: "Test".to_string(),
            guid: "guid".to_string(),
            link: Some("https://example.com/download/123".to_string()),
            ..Default::default()
        }];

        let xml = crate::torznab::generate_results_xml(
            &results,
            "All Indexers",
            Some("http://localhost:3420"),
            Some("all"),
        );

        // Download URL should be proxied through the /all indexer
        assert!(xml.contains("/api/v2.0/indexers/all/dl?link="));
    }

    #[test]
    fn test_all_indexers_magnet_not_proxied() {
        // Test that magnet URLs are NOT proxied (used directly)
        let results = vec![TorrentResult {
            title: "Test".to_string(),
            guid: "guid".to_string(),
            magnet: Some("magnet:?xt=urn:btih:abc123".to_string()),
            ..Default::default()
        }];

        let xml = crate::torznab::generate_results_xml(
            &results,
            "All Indexers",
            Some("http://localhost:3420"),
            Some("all"),
        );

        // Magnet URL should NOT be proxied
        assert!(xml.contains("magnet:?xt=urn:btih:abc123"));
        assert!(!xml.contains("/api/v2.0/indexers/all/dl?link=bWFnbmV0"));
    }
}
