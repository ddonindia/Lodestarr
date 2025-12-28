//! Field extraction utilities for HTML and JSON parsing
//!
//! This module consolidates field extraction logic that was previously duplicated
//! in the SearchExecutor implementation.

use scraper::{ElementRef, Selector};
use serde_json::Value as JsonValue;

use super::definition::{Fields, SelectorDef};
use super::filters::apply_filters_with_context;
use super::template::{TemplateContext, render_template};

/// Extract a field value using a selector definition with template context (HTML)
pub fn extract_html_field(
    element: &ElementRef,
    selector_def: &SelectorDef,
    ctx: &TemplateContext,
) -> Option<String> {
    process_field(selector_def, ctx, |sel| {
        // CSS selector logic
        if let Ok(selector) = Selector::parse(sel) {
            if let Some(found) = element.select(&selector).next() {
                match selector_def.attribute() {
                    Some(attr) => found.value().attr(attr).map(|s| s.to_string()),
                    None => Some(
                        found
                            .text()
                            .collect::<Vec<_>>()
                            .join(" ")
                            .trim()
                            .to_string(),
                    ),
                }
            } else {
                None
            }
        } else {
            None
        }
    })
}

/// Convert JSON value to string
pub fn json_value_to_string(value: &JsonValue) -> Option<String> {
    match value {
        JsonValue::String(s) => Some(s.clone()),
        JsonValue::Number(n) => Some(n.to_string()),
        JsonValue::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

/// Extract a field from JSON using selector, with parent reference support (..field)
pub fn extract_json_field(
    item: &JsonValue,
    parent: Option<&JsonValue>,
    selector_def: &SelectorDef,
    ctx: &TemplateContext,
) -> Option<String> {
    process_field(selector_def, ctx, |sel| {
        // Check for parent reference (..field)
        let (source, field) = if let Some(field) = sel.strip_prefix("..") {
            // Parent field reference
            match parent {
                Some(p) => (p, field),
                None => (item, field), // No parent, use item
            }
        } else {
            (item, sel)
        };

        source.get(field).and_then(json_value_to_string)
    })
}

/// Generic field processor that handles text templates, selectors, filters, and defaults
fn process_field<F>(
    selector_def: &SelectorDef,
    ctx: &TemplateContext,
    extract_raw: F,
) -> Option<String>
where
    F: FnOnce(&str) -> Option<String>,
{
    // 1. Handle text template
    if let Some(text_template) = selector_def.text() {
        // If text contains {{, render it
        if text_template.contains("{{") {
            let rendered = render_template(text_template, ctx);
            // Apply filters
            let filters = selector_def.filters();
            let filtered = if filters.is_empty() {
                rendered
            } else {
                apply_filters_with_context(&rendered, filters, ctx)
            };
            return if filtered.is_empty() {
                None
            } else {
                Some(filtered)
            };
        } else {
            // Static text, but still apply filters
            return Some(text_template.to_string());
        }
    }

    // 2. Handle selector
    if let Some(selector) = selector_def.selector()
        && let Some(val) = extract_raw(selector)
        && !val.is_empty()
    {
        // Apply filters
        let filters = selector_def.filters();
        let filtered = if filters.is_empty() {
            val
        } else {
            apply_filters_with_context(&val, filters, ctx)
        };
        return if filtered.is_empty() {
            None
        } else {
            Some(filtered)
        };
    }

    // 3. Handle default
    if let Some(default_template) = selector_def.default() {
        let rendered = render_template(default_template, ctx);
        let filters = selector_def.filters();
        let filtered = if filters.is_empty() {
            rendered
        } else {
            apply_filters_with_context(&rendered, filters, ctx)
        };
        return if filtered.is_empty() {
            None
        } else {
            Some(filtered)
        };
    }

    None
}

/// Extract all standard and extra fields from HTML element into context
pub fn extract_html_fields(element: &ElementRef, fields: &Fields, ctx: &mut TemplateContext) {
    // Helper to extract specific named field
    // Skip text-template fields in Pass 1 - they need to be computed in Pass 2+ after extra fields are available
    let extract_std = |name: &str, sel: &Option<SelectorDef>, ctx: &mut TemplateContext| {
        if let Some(s) = sel {
            // Skip text-only templates in Pass 1 - they depend on other fields
            if s.selector().is_none() && s.text().is_some() {
                return;
            }
            if let Some(val) = extract_html_field(element, s, ctx) {
                ctx.set_result(name, val);
            }
        }
    };

    // Pass 1: Extract actual fields (selectors only, NOT text templates)

    // Standard fields - title is required so always try to extract
    if fields.title.selector().is_some() {
        if let Some(val) = extract_html_field(element, &fields.title, ctx) {
            ctx.set_result("title", val);
        }
    }
    extract_std("details", &fields.details, ctx);
    extract_std("download", &fields.download, ctx);
    extract_std("magnet", &fields.magnet, ctx);
    extract_std("section", &fields.category, ctx);
    extract_std("size", &fields.size, ctx);
    extract_std("date", &fields.date, ctx);
    extract_std("seeders", &fields.seeders, ctx);
    extract_std("leechers", &fields.leechers, ctx);
    extract_std("grabs", &fields.grabs, ctx);
    extract_std("infohash", &fields.infohash, ctx);
    extract_std("imdbid", &fields.imdbid, ctx);
    extract_std("imdb", &fields.imdb, ctx);

    // Extra fields
    for (name, selector_def) in &fields.extra {
        // Skip text-only (computed)
        if selector_def.selector().is_none() && selector_def.text().is_some() {
            continue;
        }
        if let Some(value) = extract_html_field(element, selector_def, ctx) {
            ctx.set_result(name, value);
        }
    }

    // Also map "category" explicitly if present
    if let Some(ref sel) = fields.category
        && let Some(val) = extract_html_field(element, sel, ctx)
    {
        ctx.set_result("category", val);
    }

    // Pass 2-5: Compute text-based fields (templates using results)
    for _pass in 0..5 {
        let mut any_new = false;

        // 1. Process Extra fields templates
        for (name, selector_def) in &fields.extra {
            if selector_def.selector().is_some() || selector_def.text().is_none() {
                continue;
            }
            if ctx.result.contains_key(name) {
                continue;
            }

            if let Some(value) = extract_html_field(element, selector_def, ctx)
                && !value.is_empty()
            {
                ctx.set_result(name, value);
                any_new = true;
            }
        }

        // 2. Process Standard fields if they are text-only templates
        let mut check_computed = |name: &str, sel: &Option<SelectorDef>| {
            if !ctx.result.contains_key(name)
                && let Some(s) = sel
                && s.selector().is_none()
                && s.text().is_some()
                && let Some(val) = extract_html_field(element, s, ctx)
            {
                ctx.set_result(name, val);
                any_new = true;
            }
        };

        check_computed("title", &Some(fields.title.clone()));
        check_computed("details", &fields.details);
        check_computed("download", &fields.download);
        check_computed("magnet", &fields.magnet);
        check_computed("date", &fields.date);
        check_computed("category", &fields.category);

        if !any_new {
            break;
        }
    }
}

/// Extract all standard and extra fields from JSON into context
pub fn extract_json_fields(
    item: &JsonValue,
    parent: Option<&JsonValue>,
    fields: &Fields,
    ctx: &mut TemplateContext,
) {
    // Helper to extract specific named field
    // Skip text-template fields in Pass 1 - they need to be computed in Pass 2+ after extra fields are available
    let extract_std = |name: &str, sel: &Option<SelectorDef>, ctx: &mut TemplateContext| {
        if let Some(s) = sel {
            // Skip text-only templates in Pass 1 - they depend on other fields
            if s.selector().is_none() && s.text().is_some() {
                tracing::debug!("JSON Pass 1: Skipping text-template standard field '{}' (will compute in Pass 2+)", name);
                return;
            }
            if let Some(val) = extract_json_field(item, parent, s, ctx) {
                ctx.set_result(name, val);
            }
        }
    };

    // Pass 1: Extract actual fields (selectors only, NOT text templates)
    extract_std("title", &Some(fields.title.clone()), ctx);
    extract_std("details", &fields.details, ctx);
    extract_std("download", &fields.download, ctx);
    extract_std("magnet", &fields.magnet, ctx);
    extract_std("section", &fields.category, ctx);
    extract_std("size", &fields.size, ctx);
    extract_std("date", &fields.date, ctx);
    extract_std("seeders", &fields.seeders, ctx);
    extract_std("leechers", &fields.leechers, ctx);
    extract_std("grabs", &fields.grabs, ctx);
    extract_std("infohash", &fields.infohash, ctx);
    extract_std("imdbid", &fields.imdbid, ctx);
    extract_std("imdb", &fields.imdb, ctx);

    // Extra fields
    for (name, selector_def) in &fields.extra {
        // Skip text-only (computed)
        if selector_def.selector().is_none() && selector_def.text().is_some() {
            tracing::debug!("JSON Pass 1: Skipping text-only field '{}' (will compute later)", name);
            continue;
        }
        if let Some(value) = extract_json_field(item, parent, selector_def, ctx) {
            tracing::debug!("JSON Pass 1: Extracted extra field '{}' = '{}'", name, value);
            ctx.set_result(name, value);
        } else {
            tracing::debug!("JSON Pass 1: Failed to extract extra field '{}' (selector: {:?})", name, selector_def.selector());
        }
    }

    // Map "category"
    if let Some(ref sel) = fields.category
        && let Some(val) = extract_json_field(item, parent, sel, ctx)
    {
        ctx.set_result("category", val);
    }

    // Pass 2-5: Compute text-based fields (templates using results)
    for pass in 0..5 {
        let mut any_new = false;

        // 1. Process Extra fields templates
        for (name, selector_def) in &fields.extra {
            if selector_def.selector().is_some() || selector_def.text().is_none() {
                continue;
            }
            if ctx.result.contains_key(name) {
                continue;
            }

            tracing::debug!("JSON Pass {}: Computing extra template field '{}' with text '{:?}'", pass + 2, name, selector_def.text());
            tracing::debug!("JSON Pass {}: Current ctx.result: {:?}", pass + 2, ctx.result);
            if let Some(value) = extract_json_field(item, parent, selector_def, ctx)
                && !value.is_empty()
            {
                tracing::debug!("JSON Pass {}: Computed '{}' = '{}'", pass + 2, name, value);
                ctx.set_result(name, value);
                any_new = true;
            } else {
                tracing::debug!("JSON Pass {}: Failed to compute '{}'", pass + 2, name);
            }
        }

        // 2. Process Standard fields computed
        let mut check_computed = |name: &str, sel: &Option<SelectorDef>| {
            if !ctx.result.contains_key(name)
                && let Some(s) = sel
                && s.selector().is_none()
                && s.text().is_some()
            {
                tracing::debug!("JSON Pass {}: Computing standard field '{}' with text '{:?}'", pass + 2, name, s.text());
                if let Some(val) = extract_json_field(item, parent, s, ctx) {
                    tracing::debug!("JSON Pass {}: Computed '{}' = '{}'", pass + 2, name, val);
                    ctx.set_result(name, val);
                    any_new = true;
                }
            }
        };

        check_computed("title", &Some(fields.title.clone()));
        check_computed("details", &fields.details);
        check_computed("download", &fields.download);
        check_computed("magnet", &fields.magnet);
        check_computed("date", &fields.date);
        check_computed("category", &fields.category);

        if !any_new {
            break;
        }
    }
}
