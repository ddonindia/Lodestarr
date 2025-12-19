//! Search executor - performs actual HTTP requests and HTML parsing
//!
//! Handles HTTP requests, cookies, redirects, and delegates field extraction
//! and result building to dedicated modules.

use reqwest::{Client, Proxy};
use scraper::{Html, Selector};

use super::definition::IndexerDefinition;
use super::field_extractor::{extract_html_fields, extract_json_fields};
use super::filters::apply_filters_with_context;
use super::result_builder::{make_absolute_url, make_torrent_result};
use super::selector::{apply_selector_chain, parse_selector_chain};
use super::template::{TemplateContext, render_template};
use crate::Result;
use crate::models::{SearchQuery, TorrentResult};

/// Executes searches against indexers
#[derive(Clone)]
pub struct SearchExecutor {
    client: Client,
}

impl SearchExecutor {
    /// Create a new search executor with optional proxy
    pub fn new(proxy_url: Option<&str>) -> Result<Self> {
        let client_builder = Client::builder()
            .user_agent("Lodestarr/0.4.2")
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(30));

        let client = if let Some(url) = proxy_url {
            let proxy = Proxy::all(url).map_err(|e| anyhow::anyhow!("Invalid proxy URL: {}", e))?;
            tracing::info!("Using proxy: {} (with cookie store enabled)", url);
            client_builder.proxy(proxy)
        } else {
            client_builder
        }
        .build()
        .map_err(|e| anyhow::anyhow!("Failed to create HTTP client: {}", e))?;

        Ok(Self { client })
    }

    /// Visit the base URL to acquire cookies
    pub async fn visit_base_url(&self, definition: &IndexerDefinition) -> Result<()> {
        if let Some(base_url) = definition.base_url() {
            tracing::debug!("Pre-fetching {} to acquire session cookies", base_url);
            let _ = self
                .client
                .get(base_url)
                .header("Accept", "text/html")
                .send()
                .await?;
        }
        Ok(())
    }

    /// Download a torrent/magnet, handling multi-step selectors if defined
    pub async fn download(&self, definition: &IndexerDefinition, url: &str) -> Result<Vec<u8>> {
        // Multi-step download logic
        let download_url = if let Some(ref download_config) = definition.download {
            if let Some(ref selectors) = download_config.selectors {
                if !selectors.is_empty() {
                    tracing::info!("Performing multi-step download for {}", url);
                    // 1. Fetch the details page
                    let response = self.client.get(url).send().await?;
                    if !response.status().is_success() {
                        anyhow::bail!("Failed to fetch details page: {}", response.status());
                    }
                    let body = response.text().await?;
                    let document = Html::parse_document(&body);
                    let ctx = TemplateContext::default();

                    // 2. Parse selectors to find the real link
                    let mut final_link = None;
                    for selector in selectors {
                        // DownloadSelector struct is simple: selector, attribute, filters
                        let sel_str = &selector.selector;
                        if let Ok(css_sel) = Selector::parse(sel_str)
                            && let Some(el) = document.select(&css_sel).next()
                        {
                            // Extract attribute or text
                            let val = if let Some(ref attr) = selector.attribute {
                                el.value().attr(attr).unwrap_or("").to_string()
                            } else {
                                el.text().collect::<String>()
                            };

                            // Apply filters
                            let filtered = if selector.filters.is_empty() {
                                val
                            } else {
                                apply_filters_with_context(&val, &selector.filters, &ctx)
                            };

                            if !filtered.is_empty() {
                                // Resolve relative URL
                                final_link = Some(make_absolute_url(
                                    &filtered,
                                    definition.base_url().unwrap_or(""),
                                ));
                                break; // Found it
                            }
                        }
                    }

                    match final_link {
                        Some(l) => {
                            tracing::info!("Found real download link: {}", l);
                            l
                        }
                        None => anyhow::bail!("Could not extract download link from details page"),
                    }
                } else {
                    url.to_string()
                }
            } else {
                url.to_string()
            }
        } else {
            url.to_string()
        };

        // Final download
        tracing::debug!("Downloading from: {}", download_url);
        let response = self.client.get(&download_url).send().await?;
        if !response.status().is_success() {
            anyhow::bail!("Download failed: HTTP {}", response.status());
        }

        Ok(response.bytes().await?.to_vec())
    }

    /// Execute a search against an indexer
    pub async fn search(
        &self,
        definition: &IndexerDefinition,
        query: &SearchQuery,
        user_settings: Option<&std::collections::HashMap<String, String>>,
    ) -> Result<Vec<TorrentResult>> {
        let base_url = definition
            .base_url()
            .ok_or_else(|| anyhow::anyhow!("No base URL configured"))?;

        // Create template context with config defaults
        let mut config = definition.get_default_config();

        // Apply user overrides
        if let Some(settings) = user_settings {
            for (k, v) in settings {
                config.insert(k.clone(), v.clone());
            }
        }

        let mut ctx = TemplateContext::from_search(query).with_config(config);

        // Apply preprocessing filters to keywords
        if !definition.search.preprocessingfilters.is_empty() {
            let mut keywords = ctx.query.keywords.clone();
            keywords = apply_filters_with_context(
                &keywords,
                &definition.search.preprocessingfilters,
                &ctx,
            );
            tracing::debug!(
                "Keywords after preprocessing: '{}' -> '{}'",
                ctx.query.keywords,
                keywords
            );
            ctx.query.keywords = keywords.clone();
            // Re-encode query
            ctx.query.query = urlencoding::encode(&keywords).to_string();
        }

        // Map Torznab categories to Tracker categories
        if !query.categories.is_empty() {
            let resolved_categories: Vec<String> = query
                .categories
                .iter()
                .filter_map(|&cat_id| definition.get_tracker_category(cat_id))
                .collect();

            // If we found mapped categories, use them. Otherwise leave as is (raw Torznab IDs might be valid for some)
            if !resolved_categories.is_empty() {
                ctx.query.categories = resolved_categories;
            }
        }

        // Get all search paths that match the query categories
        let paths_to_try = self.get_matching_paths(definition, &ctx.query.categories);

        if paths_to_try.is_empty() {
            anyhow::bail!("No search path configured");
        }

        let mut all_results = Vec::new();

        // Try each matching path
        for (path_idx, search_path) in paths_to_try.iter().enumerate() {
            tracing::debug!(
                "Trying search path {}/{}: {}",
                path_idx + 1,
                paths_to_try.len(),
                search_path.path
            );

            match self
                .execute_search_path(definition, search_path, &ctx, base_url)
                .await
            {
                Ok(results) => {
                    tracing::info!("Path {} returned {} results", path_idx + 1, results.len());
                    all_results.extend(results);
                }
                Err(e) => {
                    tracing::warn!("Path {} failed: {}", path_idx + 1, e);
                    // Continue to next path
                }
            }
        }

        tracing::info!(
            "Extracted {} total results from {} paths",
            all_results.len(),
            paths_to_try.len()
        );
        Ok(all_results)
    }

    /// Get search paths that match the query categories
    fn get_matching_paths<'a>(
        &self,
        definition: &'a IndexerDefinition,
        query_categories: &[String],
    ) -> Vec<&'a super::definition::SearchPath> {
        use super::definition::StringOrInt;

        if definition.search.paths.is_empty() {
            return Vec::new();
        }

        // If no categories in query, return all paths
        if query_categories.is_empty() {
            return definition.search.paths.iter().collect();
        }

        // Filter paths by category match
        let mut matching: Vec<&super::definition::SearchPath> = definition
            .search
            .paths
            .iter()
            .filter(|path| {
                // If path has no category filter, it matches all
                if path.categories.is_empty() {
                    return true;
                }
                // Check if any query category matches any path category
                path.categories.iter().any(|path_cat| {
                    let path_cat_str = match path_cat {
                        StringOrInt::String(s) => s.clone(),
                        StringOrInt::Int(i) => i.to_string(),
                    };
                    query_categories.contains(&path_cat_str)
                })
            })
            .collect();

        // If no paths matched, fall back to all paths
        if matching.is_empty() {
            matching = definition.search.paths.iter().collect();
        }

        matching
    }

    /// Execute a single search path
    async fn execute_search_path(
        &self,
        definition: &IndexerDefinition,
        search_path: &super::definition::SearchPath,
        ctx: &TemplateContext,
        base_url: &str,
    ) -> Result<Vec<TorrentResult>> {
        // Check if this is a JSON response type
        let is_json = search_path
            .response
            .as_ref()
            .map(|r| r.response_type == "json")
            .unwrap_or(false);

        // Build search URL for this path
        let (search_url, form_data) =
            self.build_search_request_for_path(definition, search_path, ctx, base_url)?;

        // Determine HTTP method
        let method = search_path
            .method
            .as_ref()
            .unwrap_or(&definition.search.method);
        let is_post = method.eq_ignore_ascii_case("post");

        // Follow redirects setting
        let follow_redirect = search_path
            .followredirect
            .unwrap_or(definition.followredirect);

        tracing::info!(
            "Searching {} via {} at: {} (follow_redirect: {})",
            definition.name,
            if is_post { "POST" } else { "GET" },
            search_url,
            follow_redirect
        );

        // Build base request
        let mut request = if is_post {
            self.client.post(&search_url)
        } else {
            self.client.get(&search_url)
        };

        // Add default headers
        request = request
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
            .header("Accept", if is_json { "application/json" } else { "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" })
            .header("Accept-Language", "en-US,en;q=0.5");

        // Add custom headers from definition
        for (key, values) in &definition.search.headers {
            for value in values {
                let rendered = render_template(value, ctx);
                if !rendered.is_empty() {
                    tracing::debug!("Adding custom header: {}={}", key, rendered);
                    request = request.header(key.as_str(), rendered);
                }
            }
        }

        // Add form data for POST requests
        if is_post && !form_data.is_empty() {
            request = request.form(&form_data);
        }

        let response = request.send().await?;

        // Handle redirects if needed
        let final_url = response.url().to_string();
        if final_url != search_url {
            tracing::debug!("Redirected to: {}", final_url);
        }

        if !response.status().is_success() {
            anyhow::bail!("HTTP {} from {}", response.status(), search_url);
        }

        let body = response.text().await?;

        // DEBUG: Log response details
        tracing::debug!(
            "Search response: {} bytes, preview: {}",
            body.len(),
            &body[..body.len().min(200)]
        );

        // Check for specific error messages defined in the indexer
        if !definition.search.error.is_empty() {
            let document = Html::parse_document(&body);
            for error_sel in &definition.search.error {
                if let Ok(selector) = Selector::parse(&error_sel.selector)
                    && let Some(element) = document.select(&selector).next()
                {
                    let message = if let Some(ref _msg_def) = error_sel.message {
                        // Extract custom message
                        // This reuse existing field extraction logic?
                        // Simplify: just grab text for now or simple attribute match
                        element.text().collect::<String>().trim().to_string()
                    } else {
                        // Default to element text
                        element.text().collect::<String>().trim().to_string()
                    };

                    if !message.is_empty() {
                        tracing::warn!("Indexer returned error: {}", message);
                        anyhow::bail!("Indexer error: {}", message);
                    }
                }
            }
        }

        // Parse results based on response type
        // Use search_url as base for relative URL resolution (not just base_url)
        // This ensures download.php resolves to /forum/download.php not /download.php
        let results = if is_json {
            self.parse_json_results(definition, &body, base_url, ctx)
        } else {
            self.parse_html_results(definition, &body, &search_url, ctx)
        }?;

        Ok(results)
    }

    /// Build search request URL and form data for a specific path
    fn build_search_request_for_path(
        &self,
        definition: &IndexerDefinition,
        search_path: &super::definition::SearchPath,
        ctx: &TemplateContext,
        base_url: &str,
    ) -> Result<(String, std::collections::HashMap<String, String>)> {
        // Determine if POST method
        let method = search_path
            .method
            .as_ref()
            .unwrap_or(&definition.search.method);
        let is_post = method.eq_ignore_ascii_case("post");

        // Render template in path
        let rendered_path = render_template(&search_path.path, ctx);

        // Build full URL - check if path is already absolute
        let url = if rendered_path.starts_with("http://") || rendered_path.starts_with("https://") {
            rendered_path.clone()
        } else {
            let mut url = base_url.trim_end_matches('/').to_string();
            if !rendered_path.starts_with('/') && !rendered_path.starts_with('?') {
                url.push('/');
            }
            url.push_str(&rendered_path);
            url
        };

        // Merge inputs: search-level first, then path-level (path takes precedence if inheritinputs)
        let mut all_inputs = if search_path.inheritinputs {
            definition.search.inputs.clone()
        } else {
            std::collections::HashMap::new()
        };
        for (k, v) in &search_path.inputs {
            all_inputs.insert(k.clone(), v.clone());
        }

        // Render all input values
        let mut rendered_inputs: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for (k, v) in &all_inputs {
            let rendered_value = render_template(v, ctx);
            if !rendered_value.is_empty() {
                rendered_inputs.insert(k.clone(), rendered_value);
            }
        }

        // For POST: return URL without params, form data separately
        // For GET: append params to URL
        if is_post {
            Ok((url, rendered_inputs))
        } else {
            let mut final_url = url;
            if !rendered_inputs.is_empty() {
                let separator = if final_url.contains('?') { '&' } else { '?' };
                final_url.push(separator);
                let params: Vec<String> = rendered_inputs
                    .iter()
                    .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
                    .collect();
                final_url.push_str(&params.join("&"));
            }
            Ok((final_url, std::collections::HashMap::new()))
        }
    }
}

impl SearchExecutor {
    /// Parse HTML search results into TorrentResult objects
    fn parse_html_results(
        &self,
        definition: &IndexerDefinition,
        html: &str,
        base_url: &str,
        base_ctx: &TemplateContext,
    ) -> Result<Vec<TorrentResult>> {
        let document = Html::parse_document(html);
        let mut results = Vec::new();

        let row_selector_str = render_template(&definition.search.rows.selector, base_ctx);
        tracing::debug!("HTML row selector: '{}'", row_selector_str);

        let mut all_rows = Vec::new();

        // Handle comma-separated alternatives
        for selector_part in row_selector_str.split(',') {
            let selector_chain = parse_selector_chain(selector_part);
            if selector_chain.is_empty() {
                continue;
            }

            // Start with document root
            let current_elements: Vec<scraper::ElementRef> = vec![document.root_element()];

            // Apply selector chain
            let rows = apply_selector_chain(current_elements, &selector_chain);
            all_rows.extend(rows);
        }

        let rows = all_rows;
        tracing::info!("Found {} rows (proper chain parsing)", rows.len());

        // Iterate over rows
        for (idx, row) in rows.iter().enumerate() {
            // Create a context for this row
            let mut ctx = base_ctx.clone();

            // Extract all fields into context using new module
            extract_html_fields(row, &definition.search.fields, &mut ctx);

            tracing::debug!(
                "Row {}: Extracted fields: {:?}",
                idx,
                ctx.result.keys().collect::<Vec<_>>()
            );

            // Build result from context using new module
            if let Some(result) = make_torrent_result(definition, &ctx, base_url) {
                tracing::debug!("Row {}: Found title: '{}'", idx, result.title);
                results.push(result);
            } else {
                tracing::debug!("Row {}: Skipping - no title found", idx);
            }
        }

        tracing::info!(
            "Successfully parsed {} results from {} (out of {} rows)",
            results.len(),
            definition.name,
            rows.len()
        );
        Ok(results)
    }

    /// Parse JSON API results (e.g., TPB uses apibay.org)
    fn parse_json_results(
        &self,
        definition: &IndexerDefinition,
        json_str: &str,
        base_url: &str,
        base_ctx: &TemplateContext,
    ) -> Result<Vec<TorrentResult>> {
        let mut results = Vec::new();

        // Parse JSON
        let json: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| anyhow::anyhow!("Failed to parse JSON: {}", e))?;

        // Get rows using selector path (e.g., "data.movies" or "$")
        let row_selector = &definition.search.rows.selector;
        let items = self.get_json_path(&json, row_selector);

        let items = match items {
            Some(serde_json::Value::Array(arr)) => arr,
            Some(v) if v.is_array() => v.as_array().expect("checked is_array").clone(),
            _ => {
                // Check if it's TPB format (root is already array)
                if let Some(arr) = json.as_array() {
                    arr.clone()
                } else {
                    tracing::warn!("JSON rows selector '{}' didn't find an array", row_selector);
                    return Ok(results);
                }
            }
        };

        // Check for empty results (TPB returns [{"id":"0",...}] for no results)
        if items.len() == 1
            && let Some(id) = items[0].get("id").and_then(|v| v.as_str())
            && id == "0"
        {
            tracing::info!("Found 0 results from {}", definition.name);
            return Ok(results);
        }

        // Check if we need to expand with attribute (e.g., YTS has movies with multiple torrents)
        let attribute = definition.search.rows.attribute.as_ref();

        for item in &items {
            if let Some(attr) = attribute {
                // Expand: each item has sub-items in the attribute
                if let Some(sub_items) = item.get(attr).and_then(|v| v.as_array()) {
                    for sub_item in sub_items {
                        // Merge parent and sub-item data
                        if let Some(result) = self.parse_json_item(
                            definition,
                            sub_item,
                            Some(item),
                            base_url,
                            base_ctx,
                        ) {
                            results.push(result);
                        }
                    }
                }
            } else {
                // No expansion needed
                if let Some(result) =
                    self.parse_json_item(definition, item, None, base_url, base_ctx)
                {
                    results.push(result);
                }
            }
        }

        tracing::info!("Found {} results from {}", results.len(), definition.name);
        Ok(results)
    }

    /// Get a value from JSON using dot-separated path
    fn get_json_path(&self, json: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
        let path = path.trim();

        // Handle root selector
        if path == "$" || path.is_empty() {
            return Some(json.clone());
        }

        // Navigate path
        let mut current = json;
        for part in path.split('.') {
            if part.is_empty() || part == "$" {
                continue;
            }
            current = current.get(part)?;
        }
        Some(current.clone())
    }

    /// Parse a single JSON item into a TorrentResult
    fn parse_json_item(
        &self,
        definition: &IndexerDefinition,
        item: &serde_json::Value,
        parent: Option<&serde_json::Value>,
        base_url: &str,
        base_ctx: &TemplateContext,
    ) -> Option<TorrentResult> {
        let mut ctx = base_ctx.clone();

        // Extract all fields from JSON to context using new module
        extract_json_fields(item, parent, &definition.search.fields, &mut ctx);

        // Build result from context using new module
        make_torrent_result(definition, &ctx, base_url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indexer::definition::{Search, SearchPath};
    use std::collections::HashMap;

    fn make_stub_definition(method: &str) -> IndexerDefinition {
        IndexerDefinition {
            id: "test".to_string(),
            name: "Test Indexer".to_string(),
            description: "".to_string(),
            language: "en".to_string(),
            indexer_type: "public".to_string(),
            encoding: "utf-8".to_string(),
            followredirect: false,
            request_delay: None,
            links: vec!["http://example.com/".to_string()],
            legacylinks: Vec::new(),
            caps: Default::default(),
            login: None,
            settings: Vec::new(),
            search: Search {
                paths: vec![SearchPath {
                    path: "search".to_string(),
                    method: None,
                    followredirect: None,
                    response: None,
                    categories: Vec::new(),
                    inputs: HashMap::new(),
                    inheritinputs: true,
                }],
                path: None,
                method: method.to_string(),
                headers: HashMap::new(),
                inputs: {
                    let mut map = HashMap::new();
                    map.insert("q".to_string(), "{{ .Keywords }}".to_string());
                    map
                },
                keywordsfilters: Vec::new(),
                error: Vec::new(),
                preprocessingfilters: Vec::new(),
                rows: crate::indexer::definition::RowSelector {
                    selector: "".to_string(),
                    ..Default::default()
                },
                fields: crate::indexer::definition::Fields::default(),
            },
            download: None,
        }
    }

    #[tokio::test]
    async fn test_build_request_get() {
        let def = make_stub_definition("get");
        let executor = SearchExecutor::new(None).unwrap();
        let mut ctx = TemplateContext::default();
        ctx.query.keywords = "linux".to_string();

        let path = &def.search.paths[0];
        let (url, inputs) = executor
            .build_search_request_for_path(&def, path, &ctx, "http://example.com")
            .unwrap();

        // For GET, params should be in URL
        assert!(url.contains("search?"));
        assert!(url.contains("q=linux"));
        // Input map likely empty as they are merged into URL
        assert!(inputs.is_empty());
    }

    #[tokio::test]
    async fn test_build_request_post() {
        let def = make_stub_definition("post");
        let executor = SearchExecutor::new(None).unwrap();
        let mut ctx = TemplateContext::default();
        ctx.query.keywords = "linux".to_string();

        let path = &def.search.paths[0];
        let (url, inputs) = executor
            .build_search_request_for_path(&def, path, &ctx, "http://example.com")
            .unwrap();

        // For POST, params should NOT be in URL
        assert_eq!(url, "http://example.com/search");
        // Input map should contain form data
        assert_eq!(inputs.get("q").unwrap(), "linux");
    }

    #[test]
    fn test_ancestor_contains() {
        // Test parsing of chains
        let chain = parse_selector_chain("table:contains('Header') tr:has(a)");
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0].css, "table");
        assert_eq!(chain[0].contains, Some("Header".to_string()));
        assert_eq!(chain[1].css, "tr");
        assert_eq!(chain[1].has, Some("a".to_string()));

        // Test quote handling
        let chain2 = parse_selector_chain("div.foo:contains(\"Value with spaces\") span");
        assert_eq!(chain2.len(), 2);
        assert_eq!(chain2[0].contains, Some("Value with spaces".to_string()));
    }
}
