//! Filter implementations for Jackett-style value transformations
//!
//! Implements filters like querystring, regexp, replace, dateparse, etc.

use chrono::{NaiveDateTime, TimeZone, Utc};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;
use std::sync::Mutex;

use super::definition::{Filter, FilterArgs};
use super::template::{TemplateContext, render_template};

// Global regex cache to avoid recompiling the same patterns thousands of times
static REGEX_CACHE: Lazy<Mutex<HashMap<String, fancy_regex::Regex>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Static compiled regexes for common patterns (avoids runtime unwrap())
static RE_STRIPTAGS: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<[^>]*>").expect("invalid striptags regex"));
static RE_TIMEAGO: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago")
        .expect("invalid timeago regex")
});
static RE_TIMEAGO_IMPLICIT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(\d+)\s*(second|minute|hour|day|week|month|year)s?$")
        .expect("invalid timeago implicit regex")
});
static RE_TODAY_YESTERDAY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(today|yesterday)[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm)?")
        .expect("invalid today/yesterday regex")
});
static RE_PARSE_SIZE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"([\d.]+)\s*(b|kb|mb|gb|tb|kib|mib|gib|tib)?").expect("invalid parse_size regex")
});

/// Get or compile a cached regex pattern
fn get_cached_regex(pattern: &str) -> Result<fancy_regex::Regex, Box<fancy_regex::Error>> {
    let mut cache = REGEX_CACHE.lock().expect("regex cache lock poisoned");

    if let Some(re) = cache.get(pattern) {
        return Ok(re.clone());
    }

    let re = fancy_regex::Regex::new(pattern).map_err(Box::new)?;
    cache.insert(pattern.to_string(), re.clone());
    Ok(re)
}

/// Apply a list of filters with template context (for rendering filter args)
pub fn apply_filters_with_context(
    value: &str,
    filters: &[Filter],
    ctx: &TemplateContext,
) -> String {
    let mut result = value.to_string();
    for filter in filters {
        // Render filter args if they contain templates
        let rendered_args = render_filter_args(&filter.args, ctx);
        let rendered_filter = Filter {
            name: filter.name.clone(),
            args: rendered_args,
        };
        result = apply_filter(&result, &rendered_filter);
    }
    result
}

/// Render filter args through template engine
fn render_filter_args(args: &FilterArgs, ctx: &TemplateContext) -> FilterArgs {
    match args {
        FilterArgs::None => FilterArgs::None,
        FilterArgs::String(s) => FilterArgs::String(render_template(s, ctx)),
        FilterArgs::Integer(i) => FilterArgs::Integer(*i),
        FilterArgs::Float(f) => FilterArgs::Float(*f),
        FilterArgs::Bool(b) => FilterArgs::Bool(*b),
        FilterArgs::Array(arr) => {
            FilterArgs::Array(arr.iter().map(|s| render_template(s, ctx)).collect())
        }
        FilterArgs::Mixed(arr) => FilterArgs::Mixed(
            arr.iter()
                .map(|v| match v {
                    serde_yaml::Value::String(s) => {
                        serde_yaml::Value::String(render_template(s, ctx))
                    }
                    val => val.clone(),
                })
                .collect(),
        ),
    }
}

/// Apply a single filter to a value
pub fn apply_filter(value: &str, filter: &Filter) -> String {
    match filter.name.as_str() {
        "querystring" => filter_querystring(value, &filter.args),
        "regexp" => filter_regexp(value, &filter.args),
        "re_replace" => filter_re_replace(value, &filter.args),
        "replace" => filter_replace(value, &filter.args),
        "split" => filter_split(value, &filter.args),
        "trim" => filter_trim(value, &filter.args),
        "prepend" => filter_prepend(value, &filter.args),
        "append" => filter_append(value, &filter.args),
        "urldecode" => urlencoding::decode(value)
            .map(|s| s.to_string())
            .unwrap_or_else(|_| value.to_string()),
        "urlencode" => urlencoding::encode(value).to_string(),
        "htmldecode" => html_escape::decode_html_entities(value).to_string(),
        "dateparse" => filter_dateparse(value, &filter.args),
        "timeago" => filter_timeago(value),
        "fuzzytime" => filter_fuzzytime(value),
        "validfilename" => filter_validfilename(value),
        // Text case filters
        "tolower" => value.to_lowercase(),
        "toupper" => value.to_uppercase(),
        "lowercase" => value.to_lowercase(),
        "uppercase" => value.to_uppercase(),
        "substring" => filter_substring(value, &filter.args),
        "striptags" | "strip_tags" => filter_striptags(value),

        // Math filters
        "num_add" | "add" => filter_math(value, &filter.args, |a, b| a + b),
        "num_sub" | "sub" => filter_math(value, &filter.args, |a, b| a - b),
        "num_mul" | "mul" | "mult" => filter_math(value, &filter.args, |a, b| a * b),
        "num_div" | "div" => {
            filter_math(value, &filter.args, |a, b| if b != 0.0 { a / b } else { a })
        }

        _ => {
            tracing::warn!("Unknown filter: {}", filter.name);
            value.to_string()
        }
    }
}

pub fn filter_querystring(input: &str, args: &FilterArgs) -> String {
    let param = args.as_str().unwrap_or_default();
    if param.is_empty() {
        return input.to_string();
    }
    // Since input might be a URL, we parse it
    if let Ok(url) = url::Url::parse(input) {
        let pairs: HashMap<_, _> = url.query_pairs().into_owned().collect();
        if let Some(val) = pairs.get(&param) {
            return val.clone();
        }
    }

    // Fallback: try to find param=value in string using regex if not a valid URL
    // Match start of string OR ?/& separator
    let re_str = format!(r"(?:^|[?&]){}=([^&]+)", regex::escape(&param));
    if let Ok(re) = regex::Regex::new(&re_str)
        && let Some(caps) = re.captures(input)
        && let Some(m) = caps.get(1)
    {
        return m.as_str().to_string();
    }

    input.to_string()
}

pub fn filter_regexp(input: &str, args: &FilterArgs) -> String {
    let pattern = args.as_str().unwrap_or_default();
    if pattern.is_empty() {
        return input.to_string();
    }

    match get_cached_regex(&pattern) {
        Ok(re) => {
            // fancy_regex captures usage
            let captures = re.captures(input).ok().flatten();
            if let Some(caps) = captures {
                if caps.len() > 1 {
                    return caps
                        .get(1)
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_default();
                }
                return caps
                    .get(0)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();
            }
            String::new()
        }
        Err(_) => input.to_string(),
    }
}

pub fn filter_re_replace(input: &str, args: &FilterArgs) -> String {
    let vec_args = args.as_vec();
    if vec_args.len() < 2 {
        return input.to_string();
    }

    match get_cached_regex(&vec_args[0]) {
        Ok(re) => re.replace_all(input, &vec_args[1]).to_string(),
        Err(_) => input.to_string(),
    }
}

pub fn filter_replace(input: &str, args: &FilterArgs) -> String {
    let vec_args = args.as_vec();
    if vec_args.len() < 2 {
        return input.to_string();
    }
    input.replace(&vec_args[0], &vec_args[1])
}

/// Split string and get element at index
pub fn filter_split(input: &str, args: &FilterArgs) -> String {
    let vec_args = args.as_vec();
    if vec_args.is_empty() {
        return input.to_string();
    }

    let separator = &vec_args[0];
    let index: usize = if vec_args.len() > 1 {
        vec_args[1].parse().unwrap_or(0)
    } else {
        0
    };

    let parts: Vec<&str> = input.split(separator).collect();
    if index < parts.len() {
        return parts[index].to_string();
    }

    input.to_string()
}

pub fn filter_trim(input: &str, _args: &FilterArgs) -> String {
    input.trim().to_string()
}

pub fn filter_prepend(input: &str, args: &FilterArgs) -> String {
    let prefix = args.as_str().unwrap_or_default();
    format!("{}{}", prefix, input)
}

pub fn filter_append(input: &str, args: &FilterArgs) -> String {
    let suffix = args.as_str().unwrap_or_default();
    format!("{}{}", input, suffix)
}

pub fn filter_substring(input: &str, args: &FilterArgs) -> String {
    let vec_args = args.as_vec();
    if vec_args.is_empty() {
        return input.to_string();
    }

    let start: usize = vec_args[0].parse().unwrap_or(0);
    let len: usize = if vec_args.len() > 1 {
        vec_args[1].parse().unwrap_or(input.len())
    } else {
        input.len()
    };

    if start >= input.len() {
        return String::new();
    }

    let end = std::cmp::min(start + len, input.len());
    input[start..end].to_string()
}

pub fn filter_striptags(input: &str) -> String {
    // Basic HTML tag stripping
    RE_STRIPTAGS.replace_all(input, "").to_string()
}

pub fn filter_dateparse(input: &str, args: &FilterArgs) -> String {
    let format = args.as_str().unwrap_or_default();

    if format.is_empty() {
        // No format specified, try fuzzy parsing
        return filter_fuzzytime(input);
    }

    // Convert .NET format to chrono format
    let chrono_format = convert_dotnet_format(&format);

    // Try parsing with chrono
    if let Ok(dt) = NaiveDateTime::parse_from_str(input.trim(), &chrono_format) {
        return Utc.from_utc_datetime(&dt).to_rfc3339();
    }

    // Try without trim
    if let Ok(dt) = NaiveDateTime::parse_from_str(input, &chrono_format) {
        return Utc.from_utc_datetime(&dt).to_rfc3339();
    }

    // Return original if parsing fails
    input.to_string()
}

/// Convert .NET date format to chrono format
fn convert_dotnet_format(format: &str) -> String {
    format
        .replace("yyyy", "%Y")
        .replace("yy", "%y")
        .replace("MMMM", "%B")
        .replace("MMM", "%b")
        .replace("MM", "%m")
        .replace("dd", "%d")
        .replace("HH", "%H")
        .replace("hh", "%I")
        .replace("mm", "%M")
        .replace("ss", "%S")
        .replace("tt", "%p")
        .replace("zzz", "%:z")
}

/// Parse relative time expressions like "2 hours ago"
fn filter_timeago(value: &str) -> String {
    let now = Utc::now();
    let lower = value.to_lowercase();
    let lower = lower.trim();

    // Handle "X unit(s) ago" patterns
    if let Some(caps) = RE_TIMEAGO.captures(lower) {
        let amount: i64 = caps[1].parse().unwrap_or(0);
        let unit = &caps[2];

        // Helper to subtract safely
        let duration = match unit {
            "second" => chrono::Duration::seconds(amount),
            "minute" => chrono::Duration::minutes(amount),
            "hour" => chrono::Duration::hours(amount),
            "day" => chrono::Duration::days(amount),
            "week" => chrono::Duration::weeks(amount),
            "month" => chrono::Duration::days(amount * 30),
            "year" => chrono::Duration::days(amount * 365),
            _ => return value.to_string(),
        };

        return (now - duration).to_rfc3339();
    }

    // Handle "yesterday", "today"
    if lower.contains("yesterday") {
        return (now - chrono::Duration::days(1)).to_rfc3339();
    }
    if lower.contains("today") || lower.contains("just now") {
        return now.to_rfc3339();
    }

    // Handle "X unit(s)" (implied ago)
    if let Some(caps) = RE_TIMEAGO_IMPLICIT.captures(lower) {
        let amount: i64 = caps[1].parse().unwrap_or(0);
        let unit = &caps[2];
        let duration = match unit {
            "second" => chrono::Duration::seconds(amount),
            "minute" => chrono::Duration::minutes(amount),
            "hour" => chrono::Duration::hours(amount),
            "day" => chrono::Duration::days(amount),
            // Common in trackers: "2 weeks"
            "week" => chrono::Duration::weeks(amount),
            "month" => chrono::Duration::days(amount * 30),
            "year" => chrono::Duration::days(amount * 365),
            _ => return value.to_string(),
        };
        return (now - duration).to_rfc3339();
    }

    value.to_string()
}

/// Parse fuzzy time expressions, handling various common formats
fn filter_fuzzytime(value: &str) -> String {
    let cleaned = value.trim();
    if cleaned.is_empty() {
        return value.to_string();
    }

    // 1. Try relative time ("2 hours ago", "Yesterday")
    let relative = filter_timeago(cleaned);
    if relative != cleaned {
        return relative;
    }

    // 2. Try common absolute formats
    // We try a list of common formats used by trackers
    let formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d.%m.%Y %H:%M", // Common european
        "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%b %d %Y",                 // Dec 21 2025
        "%b %d, %Y",                // Dec 21, 2025
        "%B %d %Y",                 // December 21 2025
        "%d %b %Y",                 // 21 Dec 2025
        "%a, %d %b %Y %H:%M:%S %z", // RFC 2822
    ];

    for fmt in &formats {
        if let Ok(dt) = NaiveDateTime::parse_from_str(cleaned, fmt) {
            return Utc.from_utc_datetime(&dt).to_rfc3339();
        }
    }

    // 3. Try format "Today, 10:30 PM" or "Yesterday, 09:15 AM"
    // Regex for "Today/Yesterday, HH:MM [AM/PM]"
    if let Some(caps) = RE_TODAY_YESTERDAY.captures(cleaned) {
        let day_str = &caps[1].to_lowercase();
        let time_str = &caps[2];
        let meridiem = caps.get(3).map(|m| m.as_str().to_lowercase());

        let now = Utc::now();
        let target_date = if day_str == "yesterday" {
            now - chrono::Duration::days(1)
        } else {
            now
        };

        // Construct a full date string to parse
        // If meridiem is present, append it
        let time_fmt = if meridiem.is_some() {
            "%I:%M %p"
        } else {
            "%H:%M"
        };
        let full_time_str = if let Some(m) = meridiem {
            format!("{} {}", time_str, m)
        } else {
            time_str.to_string()
        };

        if let Ok(parsed_time) = NaiveDateTime::parse_from_str(
            &format!("{} {}", target_date.format("%Y-%m-%d"), full_time_str),
            &format!("%Y-%m-%d {}", time_fmt),
        ) {
            return Utc.from_utc_datetime(&parsed_time).to_rfc3339();
        }
    }

    // Return original if all attempts fail
    value.to_string()
}

/// Make a valid filename
fn filter_validfilename(value: &str) -> String {
    let invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut result = value.to_string();
    for c in invalid_chars {
        result = result.replace(c, "_");
    }
    result
}

/// Parse file size to bytes
pub fn parse_size(value: &str) -> u64 {
    let lower = value.to_lowercase().replace([',', ' '], "");

    if let Some(caps) = RE_PARSE_SIZE.captures(&lower) {
        let num: f64 = caps[1].parse().unwrap_or(0.0);
        let unit = caps.get(2).map(|m| m.as_str()).unwrap_or("b");

        let multiplier = match unit {
            "b" => 1.0,
            "kb" => 1_000.0,
            "mb" => 1_000_000.0,
            "gb" => 1_000_000_000.0,
            "tb" => 1_000_000_000_000.0,
            "kib" => 1_024.0,
            "mib" => 1_048_576.0,
            "gib" => 1_073_741_824.0,
            "tib" => 1_099_511_627_776.0,
            _ => 1.0,
        };

        return (num * multiplier) as u64;
    }

    0
}

// Math filter helper
fn filter_math<F>(input: &str, args: &FilterArgs, op: F) -> String
where
    F: Fn(f64, f64) -> f64,
{
    let val: f64 = input.parse().unwrap_or(0.0);
    let operand: f64 = match args {
        FilterArgs::String(s) => s.parse().unwrap_or(0.0),
        FilterArgs::Integer(i) => *i as f64,
        FilterArgs::Float(f) => *f,
        FilterArgs::Mixed(arr) => {
            if let Some(first) = arr.first() {
                match first {
                    serde_yaml::Value::Number(n) => n.as_f64().unwrap_or(0.0),
                    serde_yaml::Value::String(s) => s.parse().unwrap_or(0.0),
                    _ => 0.0,
                }
            } else {
                0.0
            }
        }
        FilterArgs::Array(arr) => {
            if let Some(first) = arr.first() {
                first.parse().unwrap_or(0.0)
            } else {
                0.0
            }
        }
        // Fallback for default args
        _ => {
            // Also try to parse string from vec if available
            let vec = args.as_vec();
            if !vec.is_empty() {
                vec[0].parse().unwrap_or(0.0)
            } else {
                0.0
            }
        }
    };

    let result = op(val, operand);
    // Return integer if it's a whole number, otherwise float
    if result.fract() == 0.0 {
        (result as i64).to_string()
    } else {
        result.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_querystring() {
        let result = filter_querystring(
            "browse.php?cat=123&page=1",
            &FilterArgs::String("cat".to_string()),
        );
        assert_eq!(result, "123");

        // Test fallback for non-URL strings
        let result2 = filter_querystring("cat=456&foo=bar", &FilterArgs::String("cat".to_string()));
        assert_eq!(result2, "456");
    }

    #[test]
    fn test_regexp() {
        let result = filter_regexp(
            "Uploaded 09-14 02:31, Size 282.88 MiB",
            &FilterArgs::String(r"Uploaded (.+?),".to_string()),
        );
        assert_eq!(result, "09-14 02:31");
    }

    #[test]
    fn test_replace() {
        let result = filter_replace(
            "Y-day 12:27",
            &FilterArgs::Array(vec!["Y-day".to_string(), "yesterday".to_string()]),
        );
        assert_eq!(result, "yesterday 12:27");
    }

    #[test]
    fn test_split() {
        // Test default index 0
        let result = filter_split("sub/45/0", &FilterArgs::Array(vec!["/".to_string()]));
        assert_eq!(result, "sub");

        // Test specific index
        let result2 = filter_split(
            "sub/45/0",
            &FilterArgs::Array(vec!["/".to_string(), "1".to_string()]),
        );
        assert_eq!(result2, "45");
    }

    #[test]
    fn test_substring() {
        let result = filter_substring(
            "2023-05-12",
            &FilterArgs::Array(vec!["0".to_string(), "4".to_string()]),
        );
        assert_eq!(result, "2023");

        let result2 = filter_substring("Hello World", &FilterArgs::Array(vec!["6".to_string()]));
        assert_eq!(result2, "World");
    }

    #[test]
    fn test_striptags() {
        let result = filter_striptags("<b>Hello</b> <a href='#'>World</a><br/>");
        assert_eq!(result, "Hello World");
    }

    #[test]
    fn test_parse_size() {
        assert_eq!(parse_size("1.5 GB"), 1_500_000_000);
        assert_eq!(parse_size("500 MB"), 500_000_000);
        assert_eq!(parse_size("1 GiB"), 1_073_741_824);
    }

    #[test]
    fn test_fuzzy_date() {
        // Test existing formats
        let now = Utc::now();

        // "2 hours ago"
        let ago = filter_fuzzytime("2 hours ago");
        assert!(ago.len() > 0);

        // "Today, 10:30"
        let today_str = format!("Today, {}", now.format("%H:%M"));
        let parsed = filter_fuzzytime(&today_str);
        // Should parse correctly
        assert!(parsed.contains(&now.format("%Y-%m-%d").to_string()));
    }

    #[test]
    fn test_math_filters() {
        // Addition
        assert_eq!(
            filter_math("10", &FilterArgs::Integer(5), |a, b| a + b),
            "15"
        );
        assert_eq!(
            filter_math("10.5", &FilterArgs::Float(5.0), |a, b| a + b),
            "15.5"
        );
        assert_eq!(
            filter_math("10", &FilterArgs::String("5".to_string()), |a, b| a + b),
            "15"
        );

        // Subtraction
        assert_eq!(
            filter_math("10", &FilterArgs::Integer(3), |a, b| a - b),
            "7"
        );

        // Multiplication
        assert_eq!(
            filter_math("10", &FilterArgs::Integer(2), |a, b| a * b),
            "20"
        );
        assert_eq!(
            filter_math("2.5", &FilterArgs::Integer(2), |a, b| a * b),
            "5"
        );

        // Division
        assert_eq!(
            filter_math("10", &FilterArgs::Integer(2), |a, b| if b != 0.0 {
                a / b
            } else {
                a
            }),
            "5"
        );
        assert_eq!(
            filter_math("10", &FilterArgs::Integer(4), |a, b| if b != 0.0 {
                a / b
            } else {
                a
            }),
            "2.5"
        );
    }
}
