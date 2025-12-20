//! Static file serving for the embedded web UI

use axum::{
    http::{StatusCode, Uri},
    response::IntoResponse,
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "web/dist"]
pub struct Assets;

/// Serve static files from embedded assets
pub async fn static_handler(uri: Uri) -> impl IntoResponse {
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
