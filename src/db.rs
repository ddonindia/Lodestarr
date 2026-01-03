use chrono::{DateTime, Utc};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_db<P: AsRef<Path>>(path: P) -> DbPool {
    let manager = SqliteConnectionManager::file(path);
    let pool = Pool::new(manager).expect("Failed to create pool.");

    let conn = pool.get().expect("Failed to get connection.");
    conn.execute(
        "CREATE TABLE IF NOT EXISTS search_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            indexer TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            result_count INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL
        )",
        [],
    )
    .expect("Failed to create search_logs table");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS search_cache (
            key TEXT PRIMARY KEY,
            results TEXT NOT NULL,
            expires_at DATETIME NOT NULL
        )",
        [],
    )
    .expect("Failed to create search_cache table");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS download_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            magnet TEXT,
            download_link TEXT,
            client_name TEXT,
            download_type TEXT NOT NULL,
            timestamp DATETIME NOT NULL
        )",
        [],
    )
    .expect("Failed to create download_logs table");

    // Indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_search_logs_timestamp ON search_logs(timestamp)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_download_logs_timestamp ON download_logs(timestamp)",
        [],
    )
    .ok();

    pool
}

pub fn log_search(
    pool: &DbPool,
    query: &str,
    indexer: &str,
    result_count: usize,
    duration_ms: u128,
) -> anyhow::Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO search_logs (query, indexer, timestamp, result_count, duration_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            query,
            indexer,
            Utc::now(),
            result_count as i64,
            duration_ms as i64
        ],
    )?;
    Ok(())
}

pub fn get_recent_logs(pool: &DbPool, limit: usize) -> anyhow::Result<Vec<SearchLog>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT query, indexer, timestamp, result_count FROM search_logs 
         ORDER BY timestamp DESC LIMIT ?",
    )?;
    let logs = stmt
        .query_map([limit], |row| {
            Ok(SearchLog {
                query: row.get(0)?,
                indexer: row.get(1)?,
                timestamp: row.get(2)?,
                result_count: row.get::<_, i64>(3)? as usize,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(logs)
}

pub fn get_total_searches(pool: &DbPool) -> anyhow::Result<usize> {
    let conn = pool.get()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM search_logs", [], |r| r.get(0))?;
    Ok(count as usize)
}

pub fn get_avg_duration(pool: &DbPool) -> anyhow::Result<f64> {
    let conn = pool.get()?;
    let avg: Option<f64> =
        conn.query_row("SELECT AVG(duration_ms) FROM search_logs", [], |r| r.get(0))?;
    Ok(avg.unwrap_or(0.0))
}

pub fn get_cached_results(pool: &DbPool, key: &str) -> anyhow::Result<Option<String>> {
    let conn = pool.get()?;
    let res: Option<String> = conn
        .query_row(
            "SELECT results FROM search_cache WHERE key = ?1 AND expires_at > ?2",
            params![key, Utc::now()],
            |r| r.get(0),
        )
        .optional()?;

    Ok(res)
}

pub fn set_cached_results(
    pool: &DbPool,
    key: &str,
    results: &str,
    ttl_hours: i64,
) -> anyhow::Result<()> {
    let conn = pool.get()?;
    let expires_at = Utc::now() + chrono::Duration::hours(ttl_hours);
    conn.execute(
        "INSERT OR REPLACE INTO search_cache (key, results, expires_at) VALUES (?1, ?2, ?3)",
        params![key, results, expires_at],
    )?;
    Ok(())
}

pub fn cleanup_cache(pool: &DbPool) -> anyhow::Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM search_cache WHERE expires_at < ?1",
        params![Utc::now()],
    )?;
    Ok(())
}

/// Clear all cache entries (not just expired)
pub fn clear_all_cache(pool: &DbPool) -> anyhow::Result<usize> {
    let conn = pool.get()?;
    let deleted = conn.execute("DELETE FROM search_cache", [])?;
    Ok(deleted)
}

/// Clear all search logs
pub fn clear_search_logs(pool: &DbPool) -> anyhow::Result<usize> {
    let conn = pool.get()?;
    let deleted = conn.execute("DELETE FROM search_logs", [])?;
    Ok(deleted)
}

/// Clear all cached searches
pub fn clear_cache(pool: &DbPool) -> anyhow::Result<usize> {
    let conn = pool.get()?;
    let deleted = conn.execute("DELETE FROM search_cache", [])?;
    Ok(deleted)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SearchLog {
    pub query: String,
    pub indexer: String,
    pub timestamp: DateTime<Utc>,
    pub result_count: usize,
}

/// Represents a cached search entry
#[derive(Serialize, Deserialize, Clone)]
pub struct CachedSearch {
    pub cache_key: String,
    pub query: String,
    pub indexer: String,
    pub expires_at: DateTime<Utc>,
    pub result_count: usize,
}

/// Get list of all non-expired cached searches
pub fn get_cached_search_list(pool: &DbPool) -> anyhow::Result<Vec<CachedSearch>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT key, results, expires_at FROM search_cache WHERE expires_at > ?1 ORDER BY expires_at DESC",
    )?;

    let rows = stmt.query_map(params![Utc::now()], |row| {
        let key: String = row.get(0)?;
        let results_json: String = row.get(1)?;
        let expires_at: DateTime<Utc> = row.get(2)?;
        Ok((key, results_json, expires_at))
    })?;

    let mut searches = Vec::new();
    for row in rows {
        let (key, results_json, expires_at) = row?;

        // Parse key to extract query and indexer
        // Format: "proxied:indexer:query:category" or "native:indexer:query:..."
        let parts: Vec<&str> = key.split(':').collect();
        let (indexer, query) = if parts.len() >= 3 {
            (parts[1].to_string(), parts[2].to_string())
        } else {
            ("unknown".to_string(), key.clone())
        };

        // Count results from JSON
        let result_count = serde_json::from_str::<Vec<serde_json::Value>>(&results_json)
            .map(|v| v.len())
            .unwrap_or(0);

        searches.push(CachedSearch {
            cache_key: key,
            query,
            indexer,
            expires_at,
            result_count,
        });
    }

    Ok(searches)
}

/// Get cached results by key (returns raw JSON string)
pub fn get_cached_results_by_key(pool: &DbPool, key: &str) -> anyhow::Result<Option<String>> {
    let conn = pool.get()?;
    let res: Option<String> = conn
        .query_row(
            "SELECT results FROM search_cache WHERE key = ?1 AND expires_at > ?2",
            params![key, Utc::now()],
            |r| r.get(0),
        )
        .optional()?;

    Ok(res)
}

/// Record of a download sent to a client or saved to server
#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadLog {
    pub id: i64,
    pub title: Option<String>,
    pub magnet: Option<String>,
    pub download_link: Option<String>,
    pub client_name: Option<String>,
    pub download_type: String,
    pub timestamp: DateTime<Utc>,
}

/// Log a download to the database
pub fn log_download(
    pool: &DbPool,
    title: Option<&str>,
    magnet: Option<&str>,
    download_link: Option<&str>,
    client_name: Option<&str>,
    download_type: &str,
) -> anyhow::Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO download_logs (title, magnet, download_link, client_name, download_type, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            title,
            magnet,
            download_link,
            client_name,
            download_type,
            Utc::now()
        ],
    )?;
    Ok(())
}

/// Get recent download logs
pub fn get_download_logs(pool: &DbPool, limit: usize) -> anyhow::Result<Vec<DownloadLog>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, magnet, download_link, client_name, download_type, timestamp 
         FROM download_logs ORDER BY timestamp DESC LIMIT ?",
    )?;
    let logs = stmt
        .query_map([limit], |row| {
            Ok(DownloadLog {
                id: row.get(0)?,
                title: row.get(1)?,
                magnet: row.get(2)?,
                download_link: row.get(3)?,
                client_name: row.get(4)?,
                download_type: row.get(5)?,
                timestamp: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(logs)
}

/// Get all downloaded magnet/links for checking if an item was downloaded
pub fn get_downloaded_links(pool: &DbPool) -> anyhow::Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT magnet FROM download_logs WHERE magnet IS NOT NULL
         UNION
         SELECT DISTINCT download_link FROM download_logs WHERE download_link IS NOT NULL",
    )?;
    let links = stmt
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(links)
}

/// Clear all download logs
pub fn clear_download_logs(pool: &DbPool) -> anyhow::Result<usize> {
    let conn = pool.get()?;
    let deleted = conn.execute("DELETE FROM download_logs", [])?;
    Ok(deleted)
}
