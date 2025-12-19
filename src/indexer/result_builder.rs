//! Result builder - constructs TorrentResult from extracted fields
//!
//! This module handles the conversion of extracted field data (stored in TemplateContext)
//! into properly formatted TorrentResult objects.

use chrono::{DateTime, Utc};

use super::definition::IndexerDefinition;
use super::filters::parse_size;
use super::template::TemplateContext;
use crate::models::TorrentResult;

/// Construct a TorrentResult from a populated TemplateContext
pub fn make_torrent_result(
    definition: &IndexerDefinition,
    ctx: &TemplateContext,
    base_url: &str,
) -> Option<TorrentResult> {
    // 1. Extract title (required)
    let title = ctx.result.get("title")?.clone();
    if title.is_empty() {
        return None;
    }

    // 2. Extract details/GUID
    let details = ctx
        .result
        .get("details")
        .map(|d| make_absolute_url(d, base_url));
    let guid = details.clone().unwrap_or_else(|| title.clone());

    let mut result = TorrentResult::new(title, guid);
    result.details = details;
    result.indexer = Some(definition.id.clone());

    // 3. Categories
    if let Some(cat_id) = ctx.result.get("category")
        && let Some(torznab_id) = definition.resolve_category(cat_id)
    {
        result.categories.push(torznab_id);
    }

    // 4. Download Link
    if let Some(link) = ctx.result.get("download") {
        result.link = Some(make_absolute_url(link, base_url));
    }

    // 5. Magnet
    if let Some(magnet) = ctx.result.get("magnet") {
        result.magnet = Some(magnet.clone());
    }

    // Fallback: Use magnet as link if link missing
    if result.link.is_none() && result.magnet.is_some() {
        result.link = result.magnet.clone();
    }

    // 6. Size
    if let Some(size_str) = ctx.result.get("size") {
        result.size = Some(parse_size(size_str));
    }

    // 7. Peers
    if let Some(s) = ctx.result.get("seeders") {
        result.seeders = parse_numeric_field(s);
    }
    if let Some(l) = ctx.result.get("leechers") {
        result.leechers = parse_numeric_field(l);
    }
    if let Some(g) = ctx.result.get("grabs") {
        result.grabs = parse_numeric_field(g);
    }

    // 8. InfoHash
    if let Some(h) = ctx.result.get("infohash") {
        result.info_hash = Some(h.clone());
        // If magnet missing, create one
        if result.magnet.is_none() {
            let magnet = format!(
                "magnet:?xt=urn:btih:{}&dn={}",
                h.to_lowercase(),
                urlencoding::encode(&result.title)
            );
            result.magnet = Some(magnet);
        }
    }

    // 9. IMDB
    if let Some(imdb) = ctx.result.get("imdbid").or_else(|| ctx.result.get("imdb")) {
        result.imdb_id = Some(imdb.clone());
    }

    // 10. Date
    if let Some(date_str) = ctx.result.get("date") {
        result.publish_date = parse_date_field(date_str);
    }

    Some(result)
}

/// Parse a numeric field with comma handling
fn parse_numeric_field(value: &str) -> Option<u32> {
    value.replace(',', "").parse().ok()
}

/// Parse date field with multiple format support
fn parse_date_field(date_str: &str) -> Option<DateTime<Utc>> {
    // Try RFC3339
    if let Ok(date) = DateTime::parse_from_rfc3339(date_str) {
        return Some(date.with_timezone(&Utc));
    }

    // Try RFC2822
    if let Ok(date) = DateTime::parse_from_rfc2822(date_str) {
        return Some(date.with_timezone(&Utc));
    }

    // Try Unix timestamp
    if let Ok(timestamp) = date_str.parse::<i64>()
        && let Some(date) = DateTime::from_timestamp(timestamp, 0)
    {
        return Some(date);
    }

    None
}

/// Make a URL absolute using proper URL resolution
/// base_url is the indexer's base URL (e.g., https://nnmclub.to)
pub fn make_absolute_url(url: &str, base_url: &str) -> String {
    // Already absolute
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("magnet:") {
        return url.to_string();
    }

    // Use url crate for proper joining if possible
    if let Ok(base) = url::Url::parse(base_url)
        && let Ok(resolved) = base.join(url)
    {
        return resolved.to_string();
    }

    // Fallback: simple concatenation
    if url.starts_with('/') {
        format!("{}{}", base_url.trim_end_matches('/'), url)
    } else {
        format!("{}/{}", base_url.trim_end_matches('/'), url)
    }
}
