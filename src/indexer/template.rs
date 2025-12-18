//! Template engine for Jackett-style variable substitution
//!
//! Implements the `{{ .Variable }}` syntax used in Jackett definitions.
//! Now with full support for:
//! - and/or/eq expressions
//! - .Config.X variables
//! - .Result.X variables (two-phase extraction)
//! - .False/.True boolean values
//! - range/if/else blocks

use chrono::Datelike;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

// Static compiled regexes for common patterns (avoids runtime unwrap())
static RE_RANGE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\{\{\s*range\s+\.Categories\s*\}\}(.*?)\{\{\s*end\s*\}\}")
        .expect("invalid range regex")
});
static RE_IF_TAG: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\{\{\s*if\s+(.+?)\s*\}\}").expect("invalid if tag regex"));
static RE_END_TAG: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\{\{\s*end\s*\}\}").expect("invalid end tag regex"));
static RE_VAR: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\{\{\s*([^}]+?)\s*\}\}").expect("invalid var regex"));

/// Template context containing variables for substitution
#[derive(Debug, Clone, Default)]
pub struct TemplateContext {
    /// Query-related variables
    pub query: QueryVariables,
    /// Config variables (from settings defaults)
    pub config: HashMap<String, String>,
    /// Result variables (from first-pass field extraction)
    pub result: HashMap<String, String>,
}

/// Query-related template variables
#[derive(Debug, Clone, Default)]
pub struct QueryVariables {
    /// Search keywords
    pub keywords: String,
    /// Search query (URL encoded)
    pub query: String,
    /// IMDB ID (e.g., "tt1234567")
    pub imdbid: Option<String>,
    /// IMDB ID without "tt" prefix
    pub imdbidshort: Option<String>,
    /// TMDB ID
    pub tmdbid: Option<i32>,
    /// TVDB ID
    pub tvdbid: Option<i32>,
    /// TVMaze ID
    pub tvmazeid: Option<i32>,
    /// Trakt ID
    pub traktid: Option<i32>,
    /// Douban ID
    pub doubanid: Option<i32>,
    /// Season number
    pub season: Option<u32>,
    /// Episode number
    pub episode: Option<u32>,
    /// Year
    pub year: Option<u32>,
    /// Artist (for music)
    pub artist: Option<String>,
    /// Album (for music)
    pub album: Option<String>,
    /// Author (for books)
    pub author: Option<String>,
    /// Title (for books)
    pub title: Option<String>,
    /// Categories
    pub categories: Vec<String>,
    /// Limit
    pub limit: Option<u32>,
    /// Offset
    pub offset: Option<u32>,
    /// Page number (calculated from limit/offset)
    pub page: Option<u32>,
}

/// Render a template string with variable substitution
pub fn render_template(template: &str, ctx: &TemplateContext) -> String {
    let mut result = template.to_string();

    // Handle {{ range .Categories }}...{{end}} blocks
    result = RE_RANGE
        .replace_all(&result, |caps: &regex::Captures| {
            let inner = &caps[1];
            ctx.query
                .categories
                .iter()
                .map(|cat| inner.replace("{{.}}", cat))
                .collect::<Vec<_>>()
                .join("")
        })
        .to_string();

    // Process if blocks iteratively (handles nested and sequential blocks)
    loop {
        let before = result.clone();
        result = process_if_blocks(&result, ctx);
        if result == before {
            break;
        }
    }

    // Simple variable substitution
    result = substitute_variables(&result, ctx);

    // URL path placeholders like {query}, {page}
    result = result.replace("{query}", &ctx.query.keywords);
    result = result.replace("{keywords}", &ctx.query.keywords);
    result = result.replace("{page}", "1"); // Default to page 1

    result
}

/// Process if/else/end blocks using a stack-based approach to handle nesting
fn process_if_blocks(template: &str, ctx: &TemplateContext) -> String {
    let mut result = template.to_string();

    // Iteratively resolve innermost blocks until no blocks remain
    loop {
        let mut changes_made = false;

        let mut start_tag_indices = Vec::new();
        let mut scan_pos = 0;

        while let Some(start_idx) = result[scan_pos..].find("{{") {
            let abs_start = scan_pos + start_idx;
            let remainder = &result[abs_start..];

            // Check for if/else/end tags
            if let Some(caps) = RE_IF_TAG.captures(remainder) {
                // Found 'if', push to stack
                start_tag_indices.push(abs_start); // We push the index of {{
                scan_pos = abs_start + caps[0].len();
            } else if let Some(caps) = RE_END_TAG.captures(remainder) {
                // Found 'end', pop from stack
                if let Some(if_start) = start_tag_indices.pop() {
                    // We found a complete block from if_start to (abs_start + caps[0].len())
                    let end_tag_len = caps[0].len();
                    let block_end = abs_start + end_tag_len;

                    let full_block = &result[if_start..block_end];

                    // Extract parts
                    // block looks like {{ if COND }}...{{ end }}
                    // We need to find {{ else }} inside THIS block, but at the top level of this block
                    // Since we process innermost first, there are no nested if's inside the body anymore!
                    // So any {{ else }} we find belongs to this if.

                    let if_caps = RE_IF_TAG
                        .captures(full_block)
                        .expect("already matched if tag");
                    let condition = &if_caps[1];
                    let content_start = if_caps[0].len();
                    let content_end = full_block.len() - end_tag_len;
                    let inner_content = &full_block[content_start..content_end];

                    // Split by {{ else }}
                    let parts: Vec<&str> = inner_content.split("{{ else }}").collect();
                    let then_part = parts[0];
                    let else_part = if parts.len() > 1 { parts[1] } else { "" };

                    let replacement = if evaluate_condition(condition, ctx) {
                        then_part.to_string()
                    } else {
                        else_part.to_string()
                    };

                    // Apply replacement
                    result.replace_range(if_start..block_end, &replacement);
                    changes_made = true;

                    // Restart scan since indices shifted
                    break;
                } else {
                    // Stray {{ end }}, ignore or skip
                    scan_pos = abs_start + caps[0].len();
                }
            } else {
                // Just some other tag {{ ... }}
                scan_pos = abs_start + 2;
            }
        }

        if !changes_made {
            break;
        }
    }

    result
}

/// Evaluate a template condition
fn evaluate_condition(condition: &str, ctx: &TemplateContext) -> bool {
    let condition = condition.trim();

    // Handle "and" expression: and (EXPR1) (EXPR2)
    if let Some(stripped) = condition.strip_prefix("and ") {
        return evaluate_and_condition(stripped, ctx);
    }

    // Handle "or" expression: or EXPR1 EXPR2 EXPR3...
    if let Some(stripped) = condition.strip_prefix("or ") {
        return evaluate_or_condition(stripped, ctx);
    }

    // Handle "eq" expression: eq VALUE1 VALUE2
    if let Some(stripped) = condition.strip_prefix("eq ") {
        return evaluate_eq_condition(stripped, ctx);
    }

    // Handle "ne" expression: ne VALUE1 VALUE2
    if let Some(stripped) = condition.strip_prefix("ne ") {
        return !evaluate_eq_condition(stripped, ctx);
    }

    // Handle "gt" expression: gt VALUE1 VALUE2
    if let Some(stripped) = condition.strip_prefix("gt ") {
        return evaluate_binary_op(stripped, ctx, |a, b| compare_values(a, b) > 0);
    }

    // Handle "lt" expression: lt VALUE1 VALUE2
    if let Some(stripped) = condition.strip_prefix("lt ") {
        return evaluate_binary_op(stripped, ctx, |a, b| compare_values(a, b) < 0);
    }

    // Handle "ge" expression: ge VALUE1 VALUE2
    if let Some(stripped) = condition.strip_prefix("ge ") {
        return evaluate_binary_op(stripped, ctx, |a, b| compare_values(a, b) >= 0);
    }

    // Handle "le" expression: le VALUE1 VALUE2
    if let Some(stripped) = condition.strip_prefix("le ") {
        return evaluate_binary_op(stripped, ctx, |a, b| compare_values(a, b) <= 0);
    }

    // Handle parenthesized expression
    if condition.starts_with('(') && condition.ends_with(')') {
        return evaluate_condition(&condition[1..condition.len() - 1], ctx);
    }

    // Handle simple variable check (truthy)
    is_truthy(&get_template_value(condition, ctx))
}

/// Evaluate "and" condition with parenthesized expressions
fn evaluate_and_condition(expr: &str, ctx: &TemplateContext) -> bool {
    // Parse parenthesized expressions: (expr1) (expr2)
    let mut depth = 0;
    let mut parts = Vec::new();
    let mut current = String::new();

    for ch in expr.chars() {
        match ch {
            '(' => {
                if depth > 0 {
                    current.push(ch);
                }
                depth += 1;
            }
            ')' => {
                depth -= 1;
                if depth == 0 {
                    parts.push(current.clone());
                    current.clear();
                } else {
                    current.push(ch);
                }
            }
            _ if depth > 0 => {
                current.push(ch);
            }
            _ => {}
        }
    }

    // All parts must be true
    parts.iter().all(|p| evaluate_condition(p.trim(), ctx))
}

/// Evaluate "or" condition
fn evaluate_or_condition(expr: &str, ctx: &TemplateContext) -> bool {
    // Split on spaces but respect .Result.xxx patterns
    let parts: Vec<&str> = split_template_args(expr);

    // Any part being truthy makes the whole expression true
    for part in parts {
        let value = get_template_value(part.trim(), ctx);
        if is_truthy(&value) {
            return true;
        }
    }
    false
}

/// Split template arguments, respecting .Variable.Subfield patterns and parentheses
fn split_template_args(expr: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut depth = 0;

    for (i, ch) in expr.char_indices() {
        match ch {
            '(' => {
                if depth == 0 && start < i {
                    let segment = expr[start..i].trim();
                    if !segment.is_empty() {
                        parts.push(segment);
                    }
                    start = i;
                }
                depth += 1;
            }
            ')' => {
                depth -= 1;
                if depth == 0 {
                    // Include the closing paren in this segment
                    parts.push(expr[start..=i].trim());
                    start = i + 1;
                }
            }
            ' ' if depth == 0 => {
                let segment = expr[start..i].trim();
                if !segment.is_empty() {
                    parts.push(segment);
                }
                start = i + 1;
            }
            _ => {}
        }
    }
    if start < expr.len() && !expr[start..].trim().is_empty() {
        parts.push(expr[start..].trim());
    }
    parts
}

/// Evaluate \"eq\" condition: eq VALUE1 VALUE2
fn evaluate_eq_condition(expr: &str, ctx: &TemplateContext) -> bool {
    let parts: Vec<&str> = split_template_args(expr);
    if parts.len() < 2 {
        return false;
    }

    let val1 = get_template_value(strip_parens(parts[0]), ctx);
    let val2 = get_template_value(strip_parens(parts[1]), ctx);

    val1 == val2
}

/// Evaluate generic binary operation
fn evaluate_binary_op<F>(expr: &str, ctx: &TemplateContext, op: F) -> bool
where
    F: Fn(&str, &str) -> bool,
{
    let parts: Vec<&str> = split_template_args(expr);
    if parts.len() < 2 {
        return false;
    }

    let val1 = get_template_value(strip_parens(parts[0]), ctx);
    let val2 = get_template_value(strip_parens(parts[1]), ctx);

    op(&val1, &val2)
}

/// Compare two values, trying numeric comparison first then string
fn compare_values(a: &str, b: &str) -> i32 {
    // Try parsing as float first
    if let (Ok(na), Ok(nb)) = (a.parse::<f64>(), b.parse::<f64>()) {
        // Handle float comparison
        if (na - nb).abs() < f64::EPSILON {
            return 0;
        }
        if na < nb {
            return -1;
        }
        return 1;
    }

    // Fallback to string comparison
    a.cmp(b) as i32
}

fn strip_parens(s: &str) -> &str {
    let s = s.trim();
    if s.starts_with('(') && s.ends_with(')') {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

/// Evaluate "join" function: join .Categories "separator"
fn evaluate_join(expr: &str, ctx: &TemplateContext) -> String {
    let parts = split_template_args(expr);
    if parts.len() < 2 {
        return String::new();
    }

    let var_name = parts[0];
    let delimiter = strip_quotes(parts[1]);

    match var_name {
        ".Categories" | "Categories" => ctx.query.categories.join(delimiter),
        _ => String::new(),
    }
}

fn strip_quotes(s: &str) -> &str {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

/// Check if a value is truthy
fn is_truthy(value: &str) -> bool {
    !value.is_empty() && value != "false" && value != "0"
}

/// Substitute simple {{ .Variable }} patterns
fn substitute_variables(template: &str, ctx: &TemplateContext) -> String {
    RE_VAR
        .replace_all(template, |caps: &regex::Captures| {
            let expr = caps[1].trim();

            // Handle "or" as value selector (returns first truthy value)
            if let Some(stripped) = expr.strip_prefix("or ") {
                let parts = split_template_args(stripped);
                for part in parts {
                    let value = get_template_value(strip_parens(part), ctx);
                    if is_truthy(&value) {
                        return value;
                    }
                }
                return String::new();
            }

            get_template_value(expr, ctx)
        })
        .to_string()
}

/// Get a variable value from the context
fn get_template_value(path: &str, ctx: &TemplateContext) -> String {
    let path = path.trim().trim_start_matches('.');

    // Handle join function: join .Categories " OR "
    // Handle join function: join .Categories " OR "
    if let Some(stripped) = path.strip_prefix("join ") {
        return evaluate_join(stripped, ctx);
    }

    match path {
        // Boolean constants
        "False" => "false".to_string(),
        "True" => "true".to_string(),

        // Keywords and query
        "Keywords" => ctx.query.keywords.clone(),
        "Query.Keywords" => ctx.query.keywords.clone(),
        "Query.Q" => ctx.query.query.clone(),
        "Query.Limit" => ctx.query.limit.map(|v| v.to_string()).unwrap_or_default(),
        "Query.Offset" => ctx.query.offset.map(|v| v.to_string()).unwrap_or_default(),
        "Query.Page" => ctx.query.page.map(|v| v.to_string()).unwrap_or_default(),

        // Date variables
        path if path.starts_with("Query.Today") => {
            let now = chrono::Local::now();
            if path == "Query.Today" {
                return now.naive_local().date().to_string();
            }
            match &path[11..] {
                "" => now.naive_local().date().to_string(),
                ".Year" => now.year().to_string(),
                ".Month" => format!("{:02}", now.month()),
                ".Day" => format!("{:02}", now.day()),
                _ => String::new(),
            }
        }
        path if path.starts_with("Query.Yesterday") => {
            let yesterday = chrono::Local::now() - chrono::Duration::days(1);
            if path == "Query.Yesterday" {
                return yesterday.naive_local().date().to_string();
            }
            match &path[15..] {
                "" => yesterday.naive_local().date().to_string(),
                ".Year" => yesterday.year().to_string(),
                ".Month" => format!("{:02}", yesterday.month()),
                ".Day" => format!("{:02}", yesterday.day()),
                _ => String::new(),
            }
        }
        path if path.starts_with("Query.Tomorrow") => {
            let tomorrow = chrono::Local::now() + chrono::Duration::days(1);
            if path == "Query.Tomorrow" {
                return tomorrow.naive_local().date().to_string();
            }
            match &path[14..] {
                "" => tomorrow.naive_local().date().to_string(),
                ".Year" => tomorrow.year().to_string(),
                ".Month" => format!("{:02}", tomorrow.month()),
                ".Day" => format!("{:02}", tomorrow.day()),
                _ => String::new(),
            }
        }

        // IMDB
        "Query.IMDBID" | "Query.IMDBId" | "Query.ImdbId" => {
            ctx.query.imdbid.clone().unwrap_or_default()
        }
        "Query.IMDBIDShort" => ctx.query.imdbidshort.clone().unwrap_or_default(),

        // Other IDs
        "Query.TMDBID" => ctx.query.tmdbid.map(|v| v.to_string()).unwrap_or_default(),
        "Query.TVDBID" => ctx.query.tvdbid.map(|v| v.to_string()).unwrap_or_default(),
        "Query.TVMazeID" => ctx
            .query
            .tvmazeid
            .map(|v| v.to_string())
            .unwrap_or_default(),
        "Query.TraktID" => ctx.query.traktid.map(|v| v.to_string()).unwrap_or_default(),
        "Query.DoubanID" => ctx
            .query
            .doubanid
            .map(|v| v.to_string())
            .unwrap_or_default(),

        // TV-specific
        "Query.Season" => ctx.query.season.map(|v| v.to_string()).unwrap_or_default(),
        "Query.Episode" => ctx.query.episode.map(|v| v.to_string()).unwrap_or_default(),
        "Query.Year" => ctx.query.year.map(|v| v.to_string()).unwrap_or_default(),

        // Music-specific
        "Query.Artist" => ctx.query.artist.clone().unwrap_or_default(),
        "Query.Album" => ctx.query.album.clone().unwrap_or_default(),

        // Book-specific
        "Query.Author" => ctx.query.author.clone().unwrap_or_default(),
        "Query.Title" => ctx.query.title.clone().unwrap_or_default(),

        // Config variables
        path if path.starts_with("Config.") => {
            let key = &path[7..];
            ctx.config.get(key).cloned().unwrap_or_default()
        }

        // Result variables
        path if path.starts_with("Result.") => {
            let key = &path[7..];
            ctx.result.get(key).cloned().unwrap_or_default()
        }

        _ => {
            // Check if it's a literal string (quoted)
            if (path.starts_with('"') && path.ends_with('"'))
                || (path.starts_with('\'') && path.ends_with('\''))
            {
                return path[1..path.len() - 1].to_string();
            }

            // Check if it looks like a number
            if path.chars().all(|c| c.is_ascii_digit() || c == '.') {
                return path.to_string();
            }

            // Treat as literal if it doesn't look like a variable path (no dots)
            // But be careful about "Keywords" which is a variable without dot (handled above)
            if !path.contains('.') {
                return path.to_string();
            }

            String::new()
        }
    }
}

impl TemplateContext {
    /// Create from a search query
    pub fn from_search(query: &crate::models::SearchQuery) -> Self {
        let keywords = query.query.clone().unwrap_or_default();
        let imdbid = query.imdb_id.clone();
        let imdbidshort = imdbid
            .as_ref()
            .map(|id| id.trim_start_matches("tt").to_string());

        Self {
            query: QueryVariables {
                keywords: keywords.clone(),
                query: urlencoding::encode(&keywords).to_string(),
                imdbid,
                imdbidshort,
                tmdbid: query.tmdb_id,
                tvdbid: query.tvdb_id,
                tvmazeid: query.tvmaze_id,
                traktid: query.trakt_id,
                doubanid: query.douban_id,
                season: query.season,
                episode: query.episode,
                year: query.year,
                artist: query.artist.clone(),
                album: query.album.clone(),
                author: query.author.clone(),
                title: query.title.clone(),
                categories: query.categories.iter().map(|c| c.to_string()).collect(),
                limit: query.limit,
                offset: query.offset,
                page: match (query.limit, query.offset) {
                    (Some(limit), Some(offset)) if limit > 0 => Some((offset / limit) + 1),
                    _ => Some(1),
                },
            },
            config: HashMap::new(),
            result: HashMap::new(),
        }
    }

    /// Add config values from indexer settings
    pub fn with_config(mut self, config: HashMap<String, String>) -> Self {
        self.config = config;
        self
    }

    /// Set a result variable
    pub fn set_result(&mut self, key: &str, value: String) {
        self.result.insert(key.to_string(), value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_variable() {
        let mut ctx = TemplateContext::default();
        ctx.query.keywords = "test query".to_string();

        let result = render_template("search={{ .Keywords }}", &ctx);
        assert_eq!(result, "search=test query");
    }

    #[test]
    fn test_config_variable() {
        let mut ctx = TemplateContext::default();
        ctx.config.insert("sort".to_string(), "time".to_string());

        let result = render_template("sort={{ .Config.sort }}", &ctx);
        assert_eq!(result, "sort=time");
    }

    #[test]
    fn test_result_variable() {
        let mut ctx = TemplateContext::default();
        ctx.result
            .insert("title_optional".to_string(), "My Title".to_string());

        let result = render_template("title={{ .Result.title_optional }}", &ctx);
        assert_eq!(result, "title=My Title");
    }

    #[test]
    fn test_if_else() {
        let mut ctx = TemplateContext::default();
        ctx.query.keywords = "test".to_string();

        let template = "{{ if .Keywords }}search/{{ .Keywords }}{{ else }}browse{{ end }}";
        let result = render_template(template, &ctx);
        assert_eq!(result, "search/test");
    }

    #[test]
    fn test_if_else_empty() {
        let ctx = TemplateContext::default();

        let template = "{{ if .Keywords }}search/{{ .Keywords }}{{ else }}browse{{ end }}";
        let result = render_template(template, &ctx);
        assert_eq!(result, "browse");
    }

    #[test]
    fn test_eq_condition() {
        let mut ctx = TemplateContext::default();
        ctx.config
            .insert("disablesort".to_string(), "false".to_string());

        let template = "{{ if eq .Config.disablesort .False }}sorting{{ else }}no-sorting{{ end }}";
        let result = render_template(template, &ctx);
        assert_eq!(result, "sorting");
    }

    #[test]
    fn test_and_condition() {
        let mut ctx = TemplateContext::default();
        ctx.query.keywords = "ubuntu".to_string();
        ctx.config
            .insert("disablesort".to_string(), "false".to_string());

        let template = "{{ if and (.Keywords) (eq .Config.disablesort .False) }}sort-search{{ else }}plain{{ end }}";
        let result = render_template(template, &ctx);
        assert_eq!(result, "sort-search");
    }

    #[test]
    fn test_or_value() {
        let mut ctx = TemplateContext::default();
        ctx.result
            .insert("date_year".to_string(), "2024-01-01".to_string());

        let template = "{{ or .Result.date_year .Result.date_today }}";
        let result = render_template(template, &ctx);
        assert_eq!(result, "2024-01-01");
    }

    #[test]
    fn test_comparison_ops() {
        let mut ctx = TemplateContext::default();
        ctx.config.insert("files".to_string(), "10".to_string());
        ctx.config.insert("name".to_string(), "alpha".to_string());

        // Numeric comparisons
        assert_eq!(
            render_template("{{ if gt .Config.files 5 }}yes{{ else }}no{{ end }}", &ctx),
            "yes"
        );
        assert_eq!(
            render_template("{{ if lt .Config.files 20 }}yes{{ else }}no{{ end }}", &ctx),
            "yes"
        );
        assert_eq!(
            render_template("{{ if ge .Config.files 10 }}yes{{ else }}no{{ end }}", &ctx),
            "yes"
        );
        assert_eq!(
            render_template("{{ if le .Config.files 5 }}yes{{ else }}no{{ end }}", &ctx),
            "no"
        );

        // String comparisons
        // "alpha" > "beta" is false. "alpha" < "beta" is true.
        // In template: gt .Config.name beta  => "alpha" > "beta" => false => "no"
        assert_eq!(
            render_template(
                "{{ if gt .Config.name beta }}yes{{ else }}no{{ end }}",
                &ctx
            ),
            "no"
        );

        // lt .Config.name beta => "alpha" < "beta" => true => "yes"
        assert_eq!(
            render_template(
                "{{ if lt .Config.name beta }}yes{{ else }}no{{ end }}",
                &ctx
            ),
            "yes"
        );
    }

    #[test]
    fn test_nested_if() {
        let mut ctx = TemplateContext::default();
        ctx.query.keywords = "found".to_string();

        let template = "{{ if .Keywords }}{{ if eq .Keywords found }}FOUND{{ else }}MISMATCH{{ end }}{{ else }}EMPTY{{ end }}";
        let result = render_template(template, &ctx);
        assert_eq!(result, "FOUND");

        // Test else branch of outer
        ctx.query.keywords = "".to_string();
        let result2 = render_template(template, &ctx);
        assert_eq!(result2, "EMPTY");

        // Test else branch of inner
        ctx.query.keywords = "other".to_string();
        let result3 = render_template(template, &ctx);
        assert_eq!(result3, "MISMATCH");
    }

    #[test]
    fn test_expanded_variables() {
        let mut ctx = TemplateContext::default();
        ctx.query.page = Some(2);
        ctx.query.limit = Some(50);
        ctx.query.offset = Some(50);

        // Pagination
        assert_eq!(render_template("{{ .Query.Page }}", &ctx), "2");
        assert_eq!(render_template("{{ .Query.Limit }}", &ctx), "50");
        assert_eq!(render_template("{{ .Query.Offset }}", &ctx), "50");

        // Dates
        // Just verify they return something non-empty and look like dates
        let today = render_template("{{ .Query.Today }}", &ctx);
        assert!(!today.is_empty());
        assert!(today.contains('-'));

        let yesterday = render_template("{{ .Query.Yesterday }}", &ctx);
        assert!(!yesterday.is_empty());

        let year = render_template("{{ .Query.Today.Year }}", &ctx);
        assert_eq!(year.len(), 4);
    }
}
