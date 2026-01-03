//! API endpoints for managing download clients and sending torrents

use crate::clients::create_client;
use crate::config::{ClientType, DownloadClient};
use crate::server::AppState;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use serde::Deserialize;

/// List all configured clients
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<DownloadClient>>, (StatusCode, String)> {
    let config = state.config.read().await;
    Ok(Json(config.download_clients.clone()))
}

/// Request to add/update a client
#[derive(Deserialize)]
pub struct AddClientRequest {
    pub name: String,
    pub client_type: ClientType,
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// Add or update a download client
pub async fn add_client(
    State(state): State<AppState>,
    Json(req): Json<AddClientRequest>,
) -> Result<Json<DownloadClient>, (StatusCode, String)> {
    // Validate connection first
    let temp_client = DownloadClient {
        id: "temp".to_string(), // temporary ID
        name: req.name.clone(),
        client_type: req.client_type.clone(),
        url: req.url.clone(),
        username: req.username.clone(),
        password: req.password.clone(),
    };

    let downloader = create_client(&temp_client);
    if let Err(e) = downloader.test_connection().await {
        return Err((StatusCode::BAD_REQUEST, format!("Connection failed: {}", e)));
    }

    let mut config = state.config.write().await;

    // Create new client entry
    let client = DownloadClient {
        id: uuid::Uuid::new_v4().to_string(),
        name: req.name,
        client_type: req.client_type,
        url: req.url,
        username: req.username,
        password: req.password,
    };

    config.download_clients.push(client.clone());
    config
        .save()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(client))
}

/// Remove a client
pub async fn remove_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let mut config = state.config.write().await;
    let initial_len = config.download_clients.len();

    config.download_clients.retain(|c| c.id != id);

    if config.download_clients.len() == initial_len {
        return Err((StatusCode::NOT_FOUND, "Client not found".to_string()));
    }

    config
        .save()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::OK)
}

/// Request to send a torrent to a client
#[derive(Deserialize)]
pub struct SendToClientRequest {
    pub magnet: String,
    pub title: Option<String>,
}

/// Send magnet link to a specific client
pub async fn send_to_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<SendToClientRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let config = state.config.read().await;

    let client_config = config
        .download_clients
        .iter()
        .find(|c| c.id == id)
        .ok_or((StatusCode::NOT_FOUND, "Client not found".to_string()))?;

    let downloader = create_client(client_config);

    downloader.add_torrent(&req.magnet).await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to send to client: {}", e),
        )
    })?;

    // Log the download to the database
    let client_name = client_config.name.clone();
    drop(config); // Release the read lock before DB operation
    if let Err(e) = crate::db::log_download(
        &state.db_pool,
        req.title.as_deref(),
        Some(&req.magnet),
        None,
        Some(&client_name),
        "client",
    ) {
        tracing::warn!("Failed to log download: {}", e);
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": format!("Sent to {}", client_name)
    })))
}
