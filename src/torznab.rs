//! Torznab API client library

use crate::indexer::SearchCapabilities;
use crate::models::CATEGORIES;
pub use crate::models::TorrentResult;
use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Serialize;
use url::Url;

/// Torznab API client
pub struct TorznabClient {
    client: Client,
    base_url: Url,
    apikey: Option<String>,
}

/// Server capabilities
#[derive(Debug, Clone, Serialize)]
pub struct Capabilities {
    pub searching: Vec<(String, Vec<String>)>,
    pub categories: Vec<Category>,
}

/// Category info
#[derive(Debug, Clone, Serialize)]
pub struct Category {
    pub id: i32,
    pub name: String,
}

/// Search parameters
#[derive(Debug, Clone, Default)]
pub struct SearchParams {
    pub query: String,
    pub search_type: String,
    pub cat: Option<String>,
    pub season: Option<u32>,
    pub ep: Option<u32>,
    pub imdbid: Option<String>,
    pub tmdbid: Option<i32>,
    pub tvdbid: Option<i32>,
    pub year: Option<u32>,
    pub limit: Option<u32>,
    // Extended external IDs (Jackett/Prowlarr parity)
    pub rid: Option<i32>,       // TVRage ID
    pub tvmazeid: Option<i32>,  // TVMaze ID
    pub traktid: Option<i32>,   // Trakt ID
    pub doubanid: Option<i32>,  // Douban ID
    pub genre: Option<String>,  // Genre filter
    // Music search params
    pub album: Option<String>,
    pub artist: Option<String>,
    pub label: Option<String>,
    pub track: Option<String>,
    // Book search params
    pub title: Option<String>,
    pub author: Option<String>,
    pub publisher: Option<String>,
}

// Local TorrentResult struct removed. Using crate::models::TorrentResult.

impl TorznabClient {
    /// Create a new Torznab client
    pub fn new(base_url: &str, apikey: Option<&str>, proxy_url: Option<&str>) -> Result<Self> {
        let base_url = Url::parse(base_url)?;

        let mut builder = Client::builder()
            .user_agent("torznab-cli/0.1.0")
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(30));

        if let Some(url) = proxy_url {
            let proxy = reqwest::Proxy::all(url)?;
            builder = builder.proxy(proxy);
        }

        let client = builder.build()?;

        Ok(Self {
            client,
            base_url,
            apikey: apikey.map(String::from),
        })
    }

    /// Set the API key
    #[allow(dead_code)]
    pub fn set_apikey(&mut self, apikey: Option<String>) {
        self.apikey = apikey;
    }

    /// Build URL with query parameters
    fn build_url(&self, params: &[(&str, &str)]) -> Result<Url> {
        let mut url = self.base_url.clone();

        {
            let mut query = url.query_pairs_mut();

            if let Some(ref key) = self.apikey {
                query.append_pair("apikey", key);
            }

            for (k, v) in params {
                if !v.is_empty() {
                    query.append_pair(k, v);
                }
            }
        }

        Ok(url)
    }

    /// Get server capabilities
    pub async fn get_caps(&self) -> Result<Capabilities> {
        let url = self.build_url(&[("t", "caps")])?;

        let response = self.client.get(url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("API Error: HTTP {}", response.status()));
        }

        let text = response.text().await?;

        // Check for error in XML
        if text.contains("<error") {
            if let Some(desc_start) = text.find("description=\"") {
                let rest = &text[desc_start + 13..];
                if let Some(desc_end) = rest.find('"') {
                    return Err(anyhow!("API Error: {}", &rest[..desc_end]));
                }
            }
            return Err(anyhow!("Unknown API error"));
        }

        // Parse XML
        let mut searching = Vec::new();
        let mut categories = Vec::new();

        // Simple XML parsing for capabilities
        if let Some(search_start) = text.find("<searching>")
            && let Some(search_end) = text.find("</searching>")
        {
            let search_block = &text[search_start..search_end];

            for search_type in [
                "search",
                "tv-search",
                "movie-search",
                "music-search",
                "book-search",
            ] {
                let pattern = format!("<{}", search_type);
                if let Some(pos) = search_block.find(&pattern) {
                    let line = &search_block[pos..];
                    if line.contains("available=\"yes\"") {
                        // Extract supportedParams
                        let params = if let Some(p_start) = line.find("supportedParams=\"") {
                            let rest = &line[p_start + 17..];
                            if let Some(p_end) = rest.find('"') {
                                rest[..p_end].split(',').map(String::from).collect()
                            } else {
                                vec![]
                            }
                        } else {
                            vec![]
                        };
                        searching.push((search_type.to_string(), params));
                    }
                }
            }
        }

        // Parse categories
        let cat_pattern = regex::Regex::new(r#"<category id="(\d+)" name="([^"]+)""#)?;
        for cap in cat_pattern.captures_iter(&text) {
            if let (Some(id), Some(name)) = (cap.get(1), cap.get(2))
                && let Ok(id) = id.as_str().parse()
            {
                categories.push(Category {
                    id,
                    name: name.as_str().to_string(),
                });
            }
        }

        Ok(Capabilities {
            searching,
            categories,
        })
    }

    /// Search for torrents
    pub async fn search(&self, params: &SearchParams) -> Result<Vec<TorrentResult>> {
        let mut query_params: Vec<(&str, String)> = vec![
            ("t", params.search_type.clone()),
            ("q", params.query.clone()),
        ];

        if let Some(ref cat) = params.cat {
            query_params.push(("cat", cat.clone()));
        }
        if let Some(season) = params.season {
            query_params.push(("season", season.to_string()));
        }
        if let Some(ep) = params.ep {
            query_params.push(("ep", ep.to_string()));
        }
        if let Some(ref imdbid) = params.imdbid {
            query_params.push(("imdbid", imdbid.clone()));
        }
        if let Some(tmdbid) = params.tmdbid {
            query_params.push(("tmdbid", tmdbid.to_string()));
        }
        if let Some(tvdbid) = params.tvdbid {
            query_params.push(("tvdbid", tvdbid.to_string()));
        }
        if let Some(year) = params.year {
            query_params.push(("year", year.to_string()));
        }
        if let Some(limit) = params.limit {
            query_params.push(("limit", limit.to_string()));
        }
        // Extended external IDs
        if let Some(rid) = params.rid {
            query_params.push(("rid", rid.to_string()));
        }
        if let Some(tvmazeid) = params.tvmazeid {
            query_params.push(("tvmazeid", tvmazeid.to_string()));
        }
        if let Some(traktid) = params.traktid {
            query_params.push(("traktid", traktid.to_string()));
        }
        if let Some(doubanid) = params.doubanid {
            query_params.push(("doubanid", doubanid.to_string()));
        }
        if let Some(ref genre) = params.genre {
            query_params.push(("genre", genre.clone()));
        }
        // Music search params
        if let Some(ref album) = params.album {
            query_params.push(("album", album.clone()));
        }
        if let Some(ref artist) = params.artist {
            query_params.push(("artist", artist.clone()));
        }
        if let Some(ref label) = params.label {
            query_params.push(("label", label.clone()));
        }
        if let Some(ref track) = params.track {
            query_params.push(("track", track.clone()));
        }
        // Book search params
        if let Some(ref title) = params.title {
            query_params.push(("title", title.clone()));
        }
        if let Some(ref author) = params.author {
            query_params.push(("author", author.clone()));
        }
        if let Some(ref publisher) = params.publisher {
            query_params.push(("publisher", publisher.clone()));
        }

        let params_ref: Vec<(&str, &str)> =
            query_params.iter().map(|(k, v)| (*k, v.as_str())).collect();

        let url = self.build_url(&params_ref)?;

        let response = self.client.get(url).send().await?;
        let text = response.text().await?;

        // Check for error
        if text.contains("<error") {
            if let Some(desc_start) = text.find("description=\"") {
                let rest = &text[desc_start + 13..];
                if let Some(desc_end) = rest.find('"') {
                    return Err(anyhow!("API Error: {}", &rest[..desc_end]));
                }
            }
            return Err(anyhow!("Unknown API error"));
        }

        // Parse results from RSS/XML
        let mut results = Vec::new();

        // Extract items
        let item_regex = regex::Regex::new(r"<item>([\s\S]*?)</item>")?;
        let enclosure_regex = regex::Regex::new(r#"<enclosure[^>]*length="(\d+)""#).ok();
        let cat_regex = regex::Regex::new(r#"name="category" value="(\d+)""#).ok();

        for item_match in item_regex.captures_iter(&text) {
            let item_text = item_match.get(1).map(|m| m.as_str()).unwrap_or("");

            let title = extract_tag(item_text, "title").unwrap_or_default();
            let guid = extract_tag(item_text, "guid").unwrap_or_default();
            let link = extract_tag(item_text, "link");
            let comments = extract_tag(item_text, "comments");
            let pub_date = extract_tag(item_text, "pubDate");

            // Extract torznab attributes
            let mut size = extract_attr(item_text, "size").and_then(|s| s.parse().ok());
            // Fallback to <size> tag
            if size.is_none() {
                size = extract_tag(item_text, "size").and_then(|s| s.parse().ok());
            }
            // Fallback to <length> tag
            if size.is_none() {
                size = extract_tag(item_text, "length").and_then(|s| s.parse().ok());
            }
            // Fallback to enclosure length
            if size.is_none()
                && let Some(re) = &enclosure_regex
            {
                size = re
                    .captures(item_text)
                    .and_then(|c| c.get(1))
                    .and_then(|m| m.as_str().parse().ok());
            }

            let seeders = extract_attr(item_text, "seeders").and_then(|s| s.parse().ok());
            let leechers = extract_attr(item_text, "peers").and_then(|s| s.parse().ok());
            let grabs = extract_attr(item_text, "grabs").and_then(|s| s.parse().ok());
            let infohash = extract_attr(item_text, "infohash");
            let magneturl = extract_attr(item_text, "magneturl");

            // Extract categories
            let mut categories = Vec::new();
            if let Some(re) = &cat_regex {
                for cat_match in re.captures_iter(item_text) {
                    if let Some(cat_id) = cat_match.get(1)
                        && let Ok(id) = cat_id.as_str().parse()
                    {
                        categories.push(id);
                    }
                }
            }

            if !title.is_empty() {
                // Parse date
                let publish_date = if let Some(d) = pub_date {
                    DateTime::parse_from_rfc2822(&d)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc))
                } else {
                    None
                };

                results.push(TorrentResult {
                    title,
                    guid,
                    link,
                    details: comments,
                    magnet: magneturl,
                    publish_date,
                    categories,
                    size,
                    files: None,
                    grabs,
                    seeders,
                    leechers,
                    info_hash: infohash,
                    imdb_id: None,
                    tmdb_id: None,
                    tvdb_id: None,
                    uploader: None,
                    minimum_ratio: None,
                    minimum_seedtime: None,
                    download_volume_factor: None,
                    upload_volume_factor: None,
                    indexer: None,
                });
            }
        }

        Ok(results)
    }

    /// Download a torrent file
    pub async fn download(&self, url: &str) -> Result<Vec<u8>> {
        let response = self.client.get(url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("Download failed: HTTP {}", response.status()));
        }

        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }
}

/// Extract content from an XML tag
fn extract_tag(text: &str, tag: &str) -> Option<String> {
    let start_tag = format!("<{}>", tag);
    let end_tag = format!("</{}>", tag);

    if let Some(start) = text.find(&start_tag) {
        let content_start = start + start_tag.len();
        if let Some(end) = text[content_start..].find(&end_tag) {
            let content = &text[content_start..content_start + end];
            // Handle CDATA
            let content = if content.starts_with("<![CDATA[") && content.ends_with("]]>") {
                &content[9..content.len() - 3]
            } else {
                content
            };
            return Some(html_decode(content));
        }
    }
    None
}

/// Extract torznab attribute value
fn extract_attr(text: &str, attr_name: &str) -> Option<String> {
    let pattern = format!(r#"name="{}" value="([^"]*)""#, attr_name);
    let regex = regex::Regex::new(&pattern).ok()?;
    regex
        .captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

/// Decode HTML entities
fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

/// Generate a Torznab capabilities XML response
pub fn generate_caps_xml(
    indexer_name: &str,
    categories: &[i32],
    capabilities: &SearchCapabilities,
) -> String {
    let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    xml.push_str("\n<caps>\n");

    // Server info
    xml.push_str(&format!(
        "  <server title=\"Lodestarr - {}\" />\n",
        escape_xml(indexer_name)
    ));

    // Limits
    xml.push_str("  <limits default=\"100\" max=\"100\" />\n");

    // Searching capabilities
    xml.push_str("  <searching>\n");

    if capabilities.search {
        xml.push_str("    <search available=\"yes\" supportedParams=\"q\" />\n");
    }

    if capabilities.tv_search {
        let mut params = vec!["q"];
        if capabilities.season_episode {
            params.push("season");
            params.push("ep");
        }
        if capabilities.imdb_id {
            params.push("imdbid");
        }
        if capabilities.tvdb_id {
            params.push("tvdbid");
        }
        if capabilities.tmdb_id {
            params.push("tmdbid");
        }
        if capabilities.rid {
            params.push("rid");
        }
        if capabilities.tvmaze_id {
            params.push("tvmazeid");
        }
        if capabilities.trakt_id {
            params.push("traktid");
        }
        if capabilities.douban_id {
            params.push("doubanid");
        }
        if capabilities.year {
            params.push("year");
        }
        if capabilities.genre {
            params.push("genre");
        }
        xml.push_str(&format!(
            "    <tv-search available=\"yes\" supportedParams=\"{}\" />\n",
            params.join(",")
        ));
    }

    if capabilities.movie_search {
        let mut params = vec!["q"];
        if capabilities.imdb_id {
            params.push("imdbid");
        }
        if capabilities.tmdb_id {
            params.push("tmdbid");
        }
        if capabilities.trakt_id {
            params.push("traktid");
        }
        if capabilities.douban_id {
            params.push("doubanid");
        }
        if capabilities.year {
            params.push("year");
        }
        if capabilities.genre {
            params.push("genre");
        }
        xml.push_str(&format!(
            "    <movie-search available=\"yes\" supportedParams=\"{}\" />\n",
            params.join(",")
        ));
    }

    if capabilities.music_search {
        let mut params = vec!["q", "album", "artist"];
        if capabilities.music_label {
            params.push("label");
        }
        if capabilities.music_track {
            params.push("track");
        }
        if capabilities.year {
            params.push("year");
        }
        if capabilities.genre {
            params.push("genre");
        }
        xml.push_str(&format!(
            "    <music-search available=\"yes\" supportedParams=\"{}\" />\n",
            params.join(",")
        ));
    }

    if capabilities.book_search {
        let mut params = vec!["q", "title", "author"];
        if capabilities.book_publisher {
            params.push("publisher");
        }
        if capabilities.year {
            params.push("year");
        }
        if capabilities.genre {
            params.push("genre");
        }
        xml.push_str(&format!(
            "    <book-search available=\"yes\" supportedParams=\"{}\" />\n",
            params.join(",")
        ));
    }


    xml.push_str("  </searching>\n");

    // Categories
    xml.push_str("  <categories>\n");
    for &cat_id in categories {
        if let Some(cat) = CATEGORIES.iter().find(|c| c.id == cat_id) {
            xml.push_str(&format!(
                "    <category id=\"{}\" name=\"{}\" />\n",
                cat.id, cat.name
            ));
        }
    }
    xml.push_str("  </categories>\n");

    xml.push_str("</caps>\n");
    xml
}

/// Generate a Torznab search results XML response
/// If proxy_base_url and indexer_id are provided, download URLs will be wrapped through the proxy
pub fn generate_results_xml(
    results: &[TorrentResult],
    indexer_name: &str,
    proxy_base_url: Option<&str>,
    indexer_id: Option<&str>,
) -> String {
    let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    xml.push('\n');
    xml.push_str(r#"<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">"#);
    xml.push_str("\n<channel>\n");

    // Channel info
    xml.push_str(&format!("  <title>{}</title>\n", escape_xml(indexer_name)));
    xml.push_str("  <description>Lodestarr Torznab Feed</description>\n");

    // Results
    for result in results {
        xml.push_str("  <item>\n");
        xml.push_str(&format!(
            "    <title>{}</title>\n",
            escape_xml(&result.title)
        ));
        xml.push_str(&format!("    <guid>{}</guid>\n", escape_xml(&result.guid)));

        // link element is REQUIRED by Sonarr - always include it with fallback chain: link -> magnet -> details -> guid
        let link_url = result
            .link
            .as_ref()
            .or(result.magnet.as_ref())
            .or(result.details.as_ref())
            .map(|s| s.as_str())
            .unwrap_or(&result.guid);
        xml.push_str(&format!("    <link>{}</link>\n", escape_xml(link_url)));

        if let Some(ref details) = result.details {
            xml.push_str(&format!(
                "    <comments>{}</comments>\n",
                escape_xml(details)
            ));
        }

        // pubDate is required by Sonarr - always include it
        let pub_date = result.publish_date.unwrap_or_else(Utc::now);
        xml.push_str(&format!(
            "    <pubDate>{}</pubDate>\n",
            pub_date.format("%a, %d %b %Y %H:%M:%S +0000")
        ));

        // Torznab attributes
        if let Some(size) = result.size {
            xml.push_str(&format!("    <size>{}</size>\n", size));
            xml.push_str(&format!(
                "    <torznab:attr name=\"size\" value=\"{}\" />\n",
                size
            ));
        }

        // Categories are required by Sonarr - use default TV category if empty
        let categories: Vec<i32> = if result.categories.is_empty() {
            vec![5000] // Default to TV category
        } else {
            result.categories.clone()
        };

        for cat in &categories {
            // RSS category element (for broader client compatibility)
            xml.push_str(&format!("    <category>{}</category>\n", cat));
            // Torznab attribute (for Torznab-aware clients)
            xml.push_str(&format!(
                "    <torznab:attr name=\"category\" value=\"{}\" />\n",
                cat
            ));
        }

        if let Some(seeders) = result.seeders {
            xml.push_str(&format!(
                "    <torznab:attr name=\"seeders\" value=\"{}\" />\n",
                seeders
            ));
        }

        if let Some(leechers) = result.leechers {
            xml.push_str(&format!(
                "    <torznab:attr name=\"peers\" value=\"{}\" />\n",
                leechers
            ));
        }

        if let Some(grabs) = result.grabs {
            xml.push_str(&format!(
                "    <torznab:attr name=\"grabs\" value=\"{}\" />\n",
                grabs
            ));
        }

        if let Some(ref infohash) = result.info_hash {
            xml.push_str(&format!(
                "    <torznab:attr name=\"infohash\" value=\"{}\" />\n",
                escape_xml(infohash)
            ));
        }

        if let Some(ref magnet) = result.magnet {
            xml.push_str(&format!(
                "    <torznab:attr name=\"magneturl\" value=\"{}\" />\n",
                escape_xml(magnet)
            ));
        }

        // Enclosure is REQUIRED by Sonarr - always include it with fallback chain: magnet -> link -> details
        let raw_enclosure_url = result
            .magnet
            .as_ref()
            .or(result.link.as_ref())
            .or(result.details.as_ref())
            .map(|s| s.as_str())
            .unwrap_or(&result.guid);

        // Wrap non-magnet URLs through proxy if base_url and indexer_id provided
        let enclosure_url = if !raw_enclosure_url.starts_with("magnet:") {
            if let (Some(base), Some(indexer)) = (proxy_base_url, indexer_id) {
                // Encode URL as BASE64 for proxy
                use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
                let encoded = URL_SAFE_NO_PAD.encode(raw_enclosure_url);
                format!("{}/api/v2.0/indexers/{}/dl?link={}", base, indexer, encoded)
            } else {
                raw_enclosure_url.to_string()
            }
        } else {
            raw_enclosure_url.to_string()
        };

        let size = result.size.unwrap_or(0);
        xml.push_str(&format!(
            "    <enclosure url=\"{}\" length=\"{}\" type=\"application/x-bittorrent\" />\n",
            escape_xml(&enclosure_url),
            size
        ));

        // Removed imdb_id/download_volume_factor fields not present in Lodestarr::TorrentResult struct (or check if they exist)

        // fields: title, guid, link, comments, pub_date, size, seeders, leechers, grabs, categories, infohash, magneturl, indexer.
        // It does NOT have imdb_id. So I omit it.

        xml.push_str("  </item>\n");
    }

    xml.push_str("</channel>\n");
    xml.push_str("</rss>\n");
    xml
}

/// Generate an error XML response
pub fn generate_error_xml(code: u32, description: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<error code="{}" description="{}" />
"#,
        code,
        escape_xml(description)
    )
}

/// Escape special XML characters
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
