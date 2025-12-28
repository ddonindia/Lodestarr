use scraper::Selector;

/// A segment of a CSS selector chain
#[derive(Debug, Clone)]
pub struct SelectorSegment {
    /// The CSS selector for this level (e.g. "table.forum_header_border")
    pub css: String,
    /// Optional :contains() filter for this level
    pub contains: Option<String>,
    /// Optional :has() filter for this level
    pub has: Option<String>,
    /// Optional :not() filter for this level
    pub not: Option<String>,
    /// Combinator to next segment (currently only descendant ' ' supported implicitly)
    pub _combinator: (),
}

/// Parse a full selector string into a chain of segments
/// Handles "table:contains('X') tr:has('Y')" by splitting into ["table", "tr"] and attaching filters
pub fn parse_selector_chain(full_selector: &str) -> Vec<SelectorSegment> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut depth = 0;
    let mut quote = None;

    for c in full_selector.chars() {
        match c {
            '\'' | '"' => {
                if quote == Some(c) {
                    quote = None;
                } else if quote.is_none() {
                    quote = Some(c);
                }
                current.push(c);
            }
            '(' => {
                if quote.is_none() {
                    depth += 1;
                }
                current.push(c);
            }
            ')' => {
                if quote.is_none() && depth > 0 {
                    depth -= 1;
                }
                current.push(c);
            }
            ' ' | '>' => {
                // Treat combinators as separators
                if depth == 0 && quote.is_none() {
                    if !current.trim().is_empty() {
                        segments.push(parse_segment(&current));
                        current.clear();
                    }
                } else {
                    current.push(c);
                }
            }
            _ => current.push(c),
        }
    }
    if !current.trim().is_empty() {
        segments.push(parse_segment(&current));
    }

    segments
}

/// Parse a single segment extracting :contains, :has, and :not
fn parse_segment(segment: &str) -> SelectorSegment {
    let mut css = segment.trim().to_string();
    let mut contains = None;
    let mut has = None;
    let mut not = None;

    // Extract :contains()
    if let Some(idx) = css.find(":contains(") {
        let remainder = &css[idx + 10..];
        if let Some(end) = find_matching_paren(remainder) {
            let val = remainder[..end]
                .trim_matches(|c| c == '\'' || c == '"')
                .to_string();
            // Decode CSS escape sequences like \00a0 (non-breaking space)
            contains = Some(decode_css_escapes(&val));
            // Remove from CSS string
            let before = &css[..idx];
            let after = &remainder[end + 1..];
            css = format!("{}{}", before, after);
        }
    }

    // Extract :has()
    if let Some(idx) = css.find(":has(") {
        let remainder = &css[idx + 5..];
        if let Some(end) = find_matching_paren(remainder) {
            let val = remainder[..end].to_string();
            has = Some(val);
            // Remove from CSS string
            let before = &css[..idx];
            let after = &remainder[end + 1..];
            css = format!("{}{}", before, after);
        }
    }

    // Extract :not()
    if let Some(idx) = css.find(":not(") {
        let remainder = &css[idx + 5..];
        if let Some(end) = find_matching_paren(remainder) {
            let val = remainder[..end].to_string();
            not = Some(val);
            // Remove from CSS string
            let before = &css[..idx];
            let after = &remainder[end + 1..];
            css = format!("{}{}", before, after);
        }
    }

    SelectorSegment {
        css: css.trim().to_string(),
        contains,
        has,
        not,
        _combinator: (),
    }
}

/// Find the matching closing paren, handling nested parens
fn find_matching_paren(s: &str) -> Option<usize> {
    let mut depth = 1;
    for (i, ch) in s.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Decode CSS escape sequences like \00a0 (non-breaking space) to actual characters
/// CSS escapes are in the form \XXXXXX where X is a hex digit (1-6 digits)
/// followed by optional whitespace
fn decode_css_escapes(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\\' {
            // Collect hex digits (1-6)
            let mut hex = String::new();
            while hex.len() < 6 {
                if let Some(&next) = chars.peek() {
                    if next.is_ascii_hexdigit() {
                        hex.push(chars.next().unwrap());
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            if !hex.is_empty() {
                // Parse as hex and convert to char
                if let Ok(code) = u32::from_str_radix(&hex, 16)
                    && let Some(ch) = char::from_u32(code)
                {
                    result.push(ch);
                    // Skip optional single whitespace after escape
                    if let Some(&next) = chars.peek()
                        && (next == ' ' || next == '\t' || next == '\n')
                    {
                        chars.next();
                    }
                    continue;
                }
                // Invalid escape, keep literal
                result.push('\\');
                result.push_str(&hex);
            } else if chars.peek().is_some() {
                // Escaped literal character (e.g., \: or \')
                result.push(chars.next().unwrap());
            } else {
                result.push('\\');
            }
        } else {
            result.push(c);
        }
    }

    result
}

/// Apply a selector chain to a document or element list
pub fn apply_selector_chain<'a>(
    elements: Vec<scraper::ElementRef<'a>>,
    chain: &[SelectorSegment],
) -> Vec<scraper::ElementRef<'a>> {
    let mut current_elements = elements;

    for segment in chain {
        if segment.css.is_empty() && segment.contains.is_none() {
            continue;
        }

        let mut next_elements = Vec::new();

        // 1. CSS Select
        if !segment.css.is_empty() {
            // In a real implementation we would cache this selector or pass it in pre-parsed
            // For now we parse it here. If performance is an issue we can refactor.
            if let Ok(selector) = Selector::parse(&segment.css) {
                for element in current_elements {
                    for child in element.select(&selector) {
                        next_elements.push(child);
                    }
                }
            } else {
                // Invalid selector, skip handling for this segment or bail?
                // For robustness, we skip this segment's css part
                // But we should copy current to next? No, if CSS fails it matches nothing.
            }
        } else {
            // No CSS, implies filtering current elements
            next_elements = current_elements;
        }

        // 2. Filter by :contains
        if let Some(ref text) = segment.contains {
            next_elements.retain(|el| el.text().collect::<String>().contains(text));
        }

        // 3. Filter by :has
        if let Some(ref list_sel) = segment.has
            && let Ok(has_sel) = Selector::parse(list_sel)
        {
            next_elements.retain(|el| el.select(&has_sel).next().is_some());
        }

        // 4. Filter by :not (exclude elements matching the selector)
        if let Some(ref not_sel) = segment.not
            && let Ok(not_selector) = Selector::parse(not_sel)
        {
            next_elements.retain(|el| el.select(&not_selector).next().is_none());
        }

        current_elements = next_elements;
    }

    current_elements
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_contains() {
        let chain = parse_selector_chain("td:contains('hello')");
        assert_eq!(chain.len(), 1);
        assert_eq!(chain[0].css, "td");
        assert_eq!(chain[0].contains, Some("hello".to_string()));
    }

    #[test]
    fn test_parse_has() {
        let chain = parse_selector_chain("tr:has(a.link)");
        assert_eq!(chain.len(), 1);
        assert_eq!(chain[0].css, "tr");
        assert_eq!(chain[0].has, Some("a.link".to_string()));
    }

    #[test]
    fn test_parse_not() {
        let chain = parse_selector_chain("div:not(.hidden)");
        assert_eq!(chain.len(), 1);
        assert_eq!(chain[0].css, "div");
        assert_eq!(chain[0].not, Some(".hidden".to_string()));
    }

    #[test]
    fn test_parse_combined() {
        let chain = parse_selector_chain("table:contains('Data') tr:has(td):not(.header)");
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0].css, "table");
        assert_eq!(chain[0].contains, Some("Data".to_string()));
        assert_eq!(chain[1].css, "tr");
        assert_eq!(chain[1].has, Some("td".to_string()));
        assert_eq!(chain[1].not, Some(".header".to_string()));
    }

    #[test]
    fn test_css_escape_decode() {
        // \00a0 is non-breaking space (U+00A0)
        let decoded = decode_css_escapes(r"\00a0GB");
        assert_eq!(decoded, "\u{00a0}GB");
    }

    #[test]
    fn test_css_escape_decode_multiple() {
        let decoded = decode_css_escapes(r"\00a0TB, \00a0GB");
        assert_eq!(decoded, "\u{00a0}TB, \u{00a0}GB");
    }
}
