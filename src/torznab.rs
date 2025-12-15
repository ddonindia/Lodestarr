//! Torznab API client library

use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
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
}

/// Torrent result from search
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TorrentResult {
    #[serde(rename = "Title", default)]
    pub title: String,
    #[serde(rename = "Guid", default)]
    pub guid: String,
    #[serde(rename = "Link", default)]
    pub link: Option<String>,
    #[serde(rename = "Comments", default)]
    pub comments: Option<String>,
    #[serde(rename = "PublishDate", default)]
    pub pub_date: Option<String>,
    #[serde(rename = "Size", default)]
    pub size: Option<u64>,
    #[serde(rename = "Seeders", default)]
    pub seeders: Option<u32>,
    #[serde(rename = "Peers", default)]
    pub leechers: Option<u32>,
    #[serde(rename = "Grabs", default)]
    pub grabs: Option<u32>,
    #[serde(rename = "Category", default)]
    pub categories: Vec<i32>,
    #[serde(rename = "InfoHash", default)]
    pub infohash: Option<String>,
    #[serde(rename = "MagnetUrl", default)]
    pub magneturl: Option<String>,
    #[serde(rename = "Indexer", default)]
    pub indexer: Option<String>,
}

impl TorznabClient {
    /// Create a new Torznab client
    pub fn new(base_url: &str, apikey: Option<&str>) -> Result<Self> {
        let base_url = Url::parse(base_url)?;

        let client = Client::builder()
            .user_agent("torznab-cli/0.1.0")
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

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
        if let Some(search_start) = text.find("<searching>") {
            if let Some(search_end) = text.find("</searching>") {
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
        }

        // Parse categories
        let cat_pattern = regex::Regex::new(r#"<category id="(\d+)" name="([^"]+)""#)?;
        for cap in cat_pattern.captures_iter(&text) {
            if let (Some(id), Some(name)) = (cap.get(1), cap.get(2)) {
                if let Ok(id) = id.as_str().parse() {
                    categories.push(Category {
                        id,
                        name: name.as_str().to_string(),
                    });
                }
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
            if size.is_none() {
                if let Some(re) = &enclosure_regex {
                    size = re
                        .captures(item_text)
                        .and_then(|c| c.get(1))
                        .and_then(|m| m.as_str().parse().ok());
                }
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
                    if let Some(cat_id) = cat_match.get(1) {
                        if let Ok(id) = cat_id.as_str().parse() {
                            categories.push(id);
                        }
                    }
                }
            }

            if !title.is_empty() {
                results.push(TorrentResult {
                    title,
                    guid,
                    link,
                    comments,
                    pub_date,
                    size,
                    seeders,
                    leechers,
                    grabs,
                    categories,
                    infohash,
                    magneturl,
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
