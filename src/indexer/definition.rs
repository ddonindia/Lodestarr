//! Jackett-compatible indexer definition format (Cardigann)
//!
//! This module implements Jackett's YAML definition schema for indexer definitions.
//! See: https://github.com/Jackett/Jackett/wiki/Definition-format

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A Jackett-compatible indexer definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexerDefinition {
    /// Internal name of the indexer (unique identifier)
    pub id: String,

    /// Display name
    pub name: String,

    /// Description
    #[serde(default)]
    pub description: String,

    /// Language code (e.g., "en-US")
    #[serde(default = "default_language")]
    pub language: String,

    /// Indexer type: public, semi-private, private
    #[serde(rename = "type", default)]
    pub indexer_type: String,

    /// Website encoding (default UTF-8)
    #[serde(default = "default_encoding")]
    pub encoding: String,

    /// Follow redirects
    #[serde(default)]
    pub followredirect: bool,

    /// Request delay in seconds
    #[serde(rename = "requestDelay")]
    pub request_delay: Option<f64>,

    /// List of known domains (first is default)
    #[serde(default)]
    pub links: Vec<String>,

    /// Legacy links that should be replaced
    #[serde(default)]
    pub legacylinks: Vec<String>,

    /// Capabilities (search modes, categories)
    #[serde(default)]
    pub caps: Caps,

    /// Login configuration
    pub login: Option<Login>,

    /// Settings/configuration options
    #[serde(default)]
    pub settings: Vec<Setting>,

    /// Search configuration
    pub search: Search,

    /// Download configuration
    pub download: Option<Download>,
}

/// Setting definition for indexer configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    /// Setting name (used as key in Config)
    pub name: String,

    /// Setting type (text, select, checkbox, info, etc.)
    #[serde(rename = "type")]
    pub setting_type: String,

    /// Display label
    pub label: Option<String>,

    /// Default value
    pub default: Option<serde_yml::Value>,

    /// Options for select type
    #[serde(default)]
    pub options: HashMap<String, String>,
}

/// Capabilities block
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Caps {
    /// Category mappings
    #[serde(default)]
    pub categorymappings: Vec<CategoryMapping>,

    /// Search modes
    #[serde(default)]
    pub modes: HashMap<String, Vec<String>>,
}

/// Category mapping from tracker ID to Torznab category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryMapping {
    /// Tracker's category ID
    pub id: StringOrInt,

    /// Torznab category ID
    pub cat: String,

    /// Description
    pub desc: Option<String>,

    /// Default category flag
    #[serde(default)]
    pub default: bool,
}

/// Login configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Login {
    /// Login path
    pub path: Option<String>,

    /// Login method (post, cookie, form, etc.)
    pub method: Option<String>,

    /// Form inputs
    #[serde(default)]
    pub inputs: HashMap<String, String>,

    /// Selectors for login form
    pub form: Option<String>,

    /// Submit button info
    pub submitbutton: Option<String>,

    /// Captcha configuration
    pub captcha: Option<Captcha>,

    /// Test configuration to verify login
    pub test: Option<LoginTest>,

    /// Cookies required
    #[serde(default)]
    pub cookies: Vec<String>,
}

/// Captcha configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Captcha {
    #[serde(rename = "type")]
    pub captcha_type: Option<String>,
    pub selector: Option<String>,
    pub input: Option<String>,
}

/// Login test configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginTest {
    /// Test path
    pub path: String,
    /// Selector to verify login success
    pub selector: Option<String>,
}

/// Search configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Search {
    /// Search paths
    #[serde(default)]
    pub paths: Vec<SearchPath>,

    /// Default path (legacy)
    pub path: Option<String>,

    /// HTTP method (get or post)
    #[serde(default = "default_method")]
    pub method: String,

    /// Extra headers
    #[serde(default)]
    pub headers: HashMap<String, Vec<String>>,

    /// Query inputs
    #[serde(default)]
    pub inputs: HashMap<String, String>,

    /// Keyword filters
    #[serde(default)]
    pub keywordsfilters: Vec<Filter>,

    /// Error selectors
    #[serde(default)]
    pub error: Vec<ErrorSelector>,

    /// Preprocessing filters
    #[serde(default)]
    pub preprocessingfilters: Vec<Filter>,

    /// Row selectors
    pub rows: RowSelector,

    /// Field definitions
    pub fields: Fields,
}

/// Search path configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchPath {
    /// URL path
    pub path: String,

    /// HTTP method override
    pub method: Option<String>,

    /// Follow redirects override
    pub followredirect: Option<bool>,

    /// Response type configuration
    #[serde(default)]
    pub response: Option<ResponseConfig>,

    /// Category filter (only use this path for certain categories)
    #[serde(default)]
    pub categories: Vec<StringOrInt>,

    /// Path-specific inputs
    #[serde(default)]
    pub inputs: HashMap<String, String>,

    /// Inherit inputs from search level
    #[serde(default = "default_true")]
    pub inheritinputs: bool,
}

/// Response configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseConfig {
    /// Response type: "html" or "json"
    #[serde(rename = "type")]
    pub response_type: String,
}

/// Error selector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorSelector {
    pub selector: String,
    pub message: Option<SelectorDef>,
}

/// Row selector configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RowSelector {
    /// CSS selector for result rows (or JSON path for JSON responses)
    pub selector: String,

    /// Attribute to expand for nested arrays (e.g., "torrents" in YTS)
    pub attribute: Option<String>,

    /// Selector for rows to remove (ads, etc.)
    pub remove: Option<String>,

    /// Row filters
    #[serde(default)]
    pub filters: Vec<Filter>,

    /// Rows to merge after (for multi-row torrents)
    pub after: Option<u32>,

    /// Multiple torrents per item
    #[serde(default)]
    pub multiple: bool,

    /// If attribute is missing, treat as no results
    #[serde(default, rename = "missingAttributeEqualsNoResults")]
    pub missing_attribute_equals_no_results: bool,

    /// Count selector
    pub count: Option<CountSelector>,

    /// Date headers selector
    pub dateheaders: Option<SelectorDef>,
}

/// Count selector for checking result count
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountSelector {
    pub selector: String,
}

/// Field definitions for extracting torrent data
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Fields {
    // Required fields
    pub category: Option<SelectorDef>,
    pub categorydesc: Option<SelectorDef>,
    pub title: SelectorDef,
    pub details: Option<SelectorDef>,
    pub download: Option<SelectorDef>,
    pub magnet: Option<SelectorDef>,
    pub infohash: Option<SelectorDef>,
    pub size: Option<SelectorDef>,
    pub date: Option<SelectorDef>,
    pub seeders: Option<SelectorDef>,
    pub leechers: Option<SelectorDef>,

    // Optional fields
    pub grabs: Option<SelectorDef>,
    pub files: Option<SelectorDef>,
    pub poster: Option<SelectorDef>,
    pub imdbid: Option<SelectorDef>,
    pub imdb: Option<SelectorDef>, // Alias for imdbid
    pub tmdbid: Option<SelectorDef>,
    pub tvdbid: Option<SelectorDef>,
    pub tvmazeid: Option<SelectorDef>,
    pub traktid: Option<SelectorDef>,
    pub doubanid: Option<SelectorDef>,
    pub rageid: Option<SelectorDef>,
    pub genre: Option<SelectorDef>,
    pub description: Option<SelectorDef>,
    pub downloadvolumefactor: Option<SelectorDef>,
    pub uploadvolumefactor: Option<SelectorDef>,
    pub minimumratio: Option<SelectorDef>,
    pub minimumseedtime: Option<SelectorDef>,

    /// Catch-all for any other fields
    #[serde(flatten)]
    pub extra: HashMap<String, SelectorDef>,
}

/// Selector definition - can be simple string or complex object
#[derive(Debug, Clone, Serialize, Default)]
pub struct SelectorDef(pub SelectorComplex);

impl<'de> serde::Deserialize<'de> for SelectorDef {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // println!("Deserializing SelectorDef");
        use serde::de::{self, MapAccess, Visitor};

        struct SelectorDefVisitor;

        impl<'de> Visitor<'de> for SelectorDefVisitor {
            type Value = SelectorDef;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string, object, bool, int, or null")
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<SelectorDef, E>
            where
                E: de::Error,
            {
                Ok(SelectorDef(SelectorComplex {
                    selector: Some(value.to_string()),
                    ..Default::default()
                }))
            }

            fn visit_map<M>(self, map: M) -> std::result::Result<SelectorDef, M::Error>
            where
                M: MapAccess<'de>,
            {
                let complex = SelectorComplex::deserialize(
                    serde::de::value::MapAccessDeserializer::new(map),
                )?;
                Ok(SelectorDef(complex))
            }

            // Handle `download: false` or similar boolean values
            fn visit_bool<E>(self, _value: bool) -> std::result::Result<SelectorDef, E>
            where
                E: de::Error,
            {
                // false/true as a selector means "no selector" - return empty
                Ok(SelectorDef(SelectorComplex::default()))
            }

            // Handle `size: 0` or similar integer values
            fn visit_i64<E>(self, value: i64) -> std::result::Result<SelectorDef, E>
            where
                E: de::Error,
            {
                Ok(SelectorDef(SelectorComplex {
                    text: Some(value.to_string()),
                    ..Default::default()
                }))
            }

            fn visit_u64<E>(self, value: u64) -> std::result::Result<SelectorDef, E>
            where
                E: de::Error,
            {
                Ok(SelectorDef(SelectorComplex {
                    text: Some(value.to_string()),
                    ..Default::default()
                }))
            }

            // Handle null/empty values
            fn visit_unit<E>(self) -> std::result::Result<SelectorDef, E>
            where
                E: de::Error,
            {
                Ok(SelectorDef(SelectorComplex::default()))
            }
        }

        deserializer.deserialize_any(SelectorDefVisitor)
    }
}

/// Complex selector with attribute and filters
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SelectorComplex {
    /// CSS selector
    #[serde(default, deserialize_with = "deserialize_permissive_option_string")]
    pub selector: Option<String>,

    /// Attribute to extract (default: text content)
    #[serde(default, deserialize_with = "deserialize_permissive_option_string")]
    pub attribute: Option<String>,

    /// Optional case-based matching
    #[serde(default, deserialize_with = "deserialize_case_map")]
    pub case: Option<HashMap<String, StringOrNumber>>,

    /// Text value (static)
    #[serde(default, deserialize_with = "deserialize_permissive_option_string")]
    pub text: Option<String>,

    /// Filters to apply
    #[serde(default)]
    pub filters: Vec<Filter>,

    /// Remove elements before extraction
    #[serde(default, deserialize_with = "deserialize_permissive_option_string")]
    pub remove: Option<String>,

    /// Optional flag (field is not required)
    #[serde(default)]
    pub optional: bool,

    /// Default value/template if selector returns empty
    #[serde(default, deserialize_with = "deserialize_permissive_option_string")]
    pub default: Option<String>,
}

fn deserialize_permissive_option_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct PermissiveVisitor;

    impl<'de> serde::de::Visitor<'de> for PermissiveVisitor {
        type Value = Option<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string, bool, int, or null")
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(Some(value.to_string()))
        }

        fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(Some(value))
        }

        fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            // Treat boolean false/true as None/empty
            Ok(None)
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            if value == 0 {
                Ok(None)
            } else {
                Ok(Some(value.to_string()))
            }
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            if value == 0 {
                Ok(None)
            } else {
                Ok(Some(value.to_string()))
            }
        }

        fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(Some(value.to_string()))
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(None)
        }

        fn visit_none<E>(self) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(None)
        }

        fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            deserializer.deserialize_any(self)
        }
    }

    deserializer.deserialize_option(PermissiveVisitor)
}

impl SelectorDef {
    /// Get the CSS selector string
    pub fn selector(&self) -> Option<&str> {
        self.0.selector.as_deref()
    }

    /// Get the attribute to extract
    pub fn attribute(&self) -> Option<&str> {
        self.0.attribute.as_deref()
    }

    /// Get filters
    pub fn filters(&self) -> &[Filter] {
        &self.0.filters
    }

    /// Check if this is a static text value
    pub fn text(&self) -> Option<&str> {
        self.0.text.as_deref()
    }

    /// Get default value/template
    pub fn default(&self) -> Option<&str> {
        self.0.default.as_deref()
    }
}

/// Filter configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    /// Filter name
    pub name: String,

    /// Filter arguments
    #[serde(default)]
    pub args: FilterArgs,
}

/// Filter arguments - can be string, array, or other types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
#[derive(Default)]
pub enum FilterArgs {
    String(String),
    Integer(i64),
    Float(f64),
    Bool(bool),
    Array(Vec<String>),
    Mixed(Vec<serde_yml::Value>),
    #[default]
    None,
}

impl FilterArgs {
    /// Get as single string
    pub fn as_str(&self) -> Option<String> {
        match self {
            Self::String(s) => Some(s.clone()),
            Self::Integer(i) => Some(i.to_string()),
            Self::Float(f) => Some(f.to_string()),
            Self::Bool(b) => Some(b.to_string()),
            Self::Array(a) if !a.is_empty() => Some(a[0].clone()),
            _ => None,
        }
    }

    /// Get as string array
    pub fn as_vec(&self) -> Vec<String> {
        match self {
            Self::None => vec![],
            Self::String(s) => vec![s.clone()],
            Self::Integer(i) => vec![i.to_string()],
            Self::Float(f) => vec![f.to_string()],
            Self::Bool(b) => vec![b.to_string()],
            Self::Array(a) => a.clone(),
            Self::Mixed(v) => v
                .iter()
                .filter_map(|x| match x {
                    serde_yml::Value::String(s) => Some(s.clone()),
                    serde_yml::Value::Number(n) => Some(n.to_string()),
                    serde_yml::Value::Bool(b) => Some(b.to_string()),
                    _ => None,
                })
                .collect(),
        }
    }
}

/// Download configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    /// Selectors to run before download
    pub selectors: Option<Vec<DownloadSelector>>,

    /// Use infohash for magnet generation
    pub infohash: Option<SelectorDef>,

    /// Method (get or post)
    pub method: Option<String>,

    /// Before path selector
    pub before: Option<BeforeDownload>,
}

/// Download selector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSelector {
    pub selector: String,
    pub attribute: Option<String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
}

/// Before download configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeforeDownload {
    pub pathselector: Option<SelectorDef>,
}

/// String or integer (for category IDs that can be either)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrInt {
    String(String),
    Int(i64),
}

impl std::fmt::Display for StringOrInt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::String(s) => write!(f, "{}", s),
            Self::Int(i) => write!(f, "{}", i),
        }
    }
}

/// String or number for volume factors
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrNumber {
    String(String),
    Int(i64),
    Float(f64),
}

// Default functions
fn default_language() -> String {
    "en-US".to_string()
}

fn default_encoding() -> String {
    "UTF-8".to_string()
}

fn default_method() -> String {
    "get".to_string()
}

fn default_true() -> bool {
    true
}

impl IndexerDefinition {
    /// Load from a YAML file
    pub fn from_file(path: &std::path::Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;

        // Strip BOM if present
        let content = if let Some(stripped) = content.strip_prefix("\u{feff}") {
            stripped
        } else {
            &content
        };

        // Parse YAML
        let definition: IndexerDefinition = serde_yml::from_str(content)?;

        Ok(definition)
    }

    /// Get the first available base URL
    pub fn base_url(&self) -> Option<&str> {
        self.links.first().map(|s| s.as_str())
    }

    /// Get category ID for a Torznab category
    /// Falls back to parent category if subcategory not found (e.g., 5030 → 5000)
    pub fn get_tracker_category(&self, torznab_cat: i32) -> Option<String> {
        // First try exact match
        for mapping in &self.caps.categorymappings {
            if let Some(id) = Self::resolve_torznab_category_name(&mapping.cat)
                && id == torznab_cat
            {
                return Some(mapping.id.to_string());
            }
        }

        // If no exact match, try parent category (floor to nearest 1000)
        let parent_cat = (torznab_cat / 1000) * 1000;
        if parent_cat != torznab_cat {
            for mapping in &self.caps.categorymappings {
                if let Some(id) = Self::resolve_torznab_category_name(&mapping.cat)
                    && id == parent_cat
                {
                    return Some(mapping.id.to_string());
                }
            }
        }

        None
    }

    /// Get default config values from settings
    pub fn get_default_config(&self) -> HashMap<String, String> {
        let mut config = HashMap::new();
        for setting in &self.settings {
            if let Some(ref default) = setting.default {
                let value = match default {
                    serde_yml::Value::String(s) => s.clone(),
                    serde_yml::Value::Bool(b) => b.to_string(),
                    serde_yml::Value::Number(n) => n.to_string(),
                    _ => continue,
                };
                config.insert(setting.name.clone(), value);
            }
        }
        // Add special values
        config.insert(
            "sitelink".to_string(),
            self.base_url().unwrap_or("").to_string(),
        );
        config
    }

    /// Resolve tracker category ID to Torznab category ID
    pub fn resolve_category(&self, tracker_cat: &str) -> Option<i32> {
        // Find mapping for this tracker ID
        for mapping in &self.caps.categorymappings {
            if mapping.id.to_string() == tracker_cat {
                // Resolve Torznab category name to ID
                return Self::resolve_torznab_category_name(&mapping.cat);
            }
        }
        None
    }

    /// Extract supported Torznab categories from this definition
    pub fn extract_categories(&self) -> Vec<i32> {
        let mut categories = Vec::new();

        for mapping in &self.caps.categorymappings {
            if let Some(cat_id) = Self::resolve_torznab_category_name(&mapping.cat)
                && !categories.contains(&cat_id)
            {
                categories.push(cat_id);
            }
        }

        categories.sort();
        categories
    }

    /// Resolve standard Torznab category name to ID
    pub fn resolve_torznab_category_name(name: &str) -> Option<i32> {
        match name {
            "Console" => Some(1000),
            "Console/NDS" => Some(1010),
            "Console/PSP" => Some(1020),
            "Console/Wii" => Some(1030),
            "Console/XBox" => Some(1040),
            "Console/XBox 360" => Some(1050),
            "Console/Wiiware" => Some(1060),
            "Console/XBox 360 DLC" => Some(1070),
            "Console/PS3" => Some(1080),
            "Console/Other" => Some(1090),
            "Console/3DS" => Some(1110),
            "Console/PS Vita" => Some(1120),
            "Console/WiiU" => Some(1130),
            "Console/XBox One" => Some(1140),
            "Console/PS4" => Some(1180),

            "Movies" => Some(2000),
            "Movies/Foreign" => Some(2010),
            "Movies/Other" => Some(2020),
            "Movies/SD" => Some(2030),
            "Movies/HD" => Some(2040),
            "Movies/UHD" => Some(2045),
            "Movies/BluRay" => Some(2050),
            "Movies/3D" => Some(2060),
            "Movies/DVD" => Some(2070),
            "Movies/WEB-DL" => Some(2080),

            "Audio" => Some(3000),
            "Audio/MP3" => Some(3010),
            "Audio/Video" => Some(3020),
            "Audio/Audiobook" => Some(3030),
            "Audio/Lossless" => Some(3040),
            "Audio/Other" => Some(3050),
            "Audio/Foreign" => Some(3060),

            "PC" => Some(4000),
            "PC/0day" => Some(4010),
            "PC/ISO" => Some(4020),
            "PC/Mac" => Some(4030),
            "PC/Mobile-Other" => Some(4040),
            "PC/Games" => Some(4050),
            "PC/Mobile-iOS" => Some(4060),
            "PC/Mobile-Android" => Some(4070),

            "TV" => Some(5000),
            "TV/WEB-DL" => Some(5010),
            "TV/Foreign" => Some(5020),
            "TV/SD" => Some(5030),
            "TV/HD" => Some(5040),
            "TV/UHD" => Some(5045),
            "TV/Other" => Some(5050),
            "TV/Sport" => Some(5060),
            "TV/Anime" => Some(5070),
            "TV/Documentary" => Some(5080),

            "XXX" => Some(6000),
            "XXX/DVD" => Some(6010),
            "XXX/WMV" => Some(6020),
            "XXX/XviD" => Some(6030),
            "XXX/x264" => Some(6040),
            "XXX/UHD" => Some(6045),
            "XXX/Pack" => Some(6050),
            "XXX/ImageSet" => Some(6060),
            "XXX/Other" => Some(6070),
            "XXX/SD" => Some(6080),
            "XXX/WEB-DL" => Some(6090),

            "Books" => Some(7000),
            "Books/Mags" => Some(7010),
            "Books/EBook" => Some(7020),
            "Books/Comics" => Some(7030),
            "Books/Technical" => Some(7040),
            "Books/Other" => Some(7050),
            "Books/Foreign" => Some(7060),

            "Other" => Some(8000),
            "Other/Misc" => Some(8010),
            "Other/Hashed" => Some(8020),
            _ => None,
        }
    }
}

fn deserialize_case_map<'de, D>(
    deserializer: D,
) -> Result<Option<HashMap<String, StringOrNumber>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{MapAccess, Visitor};
    use std::fmt;

    struct CaseMapVisitor;

    impl<'de> Visitor<'de> for CaseMapVisitor {
        type Value = Option<HashMap<String, StringOrNumber>>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map with string, bool, or number keys")
        }

        fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
        where
            M: MapAccess<'de>,
        {
            let mut values = HashMap::new();
            while let Some((key, value)) = map.next_entry::<CaseKey, StringOrNumber>()? {
                values.insert(key.0, value);
            }
            Ok(Some(values))
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(None)
        }
    }

    struct CaseKey(String);

    impl<'de> serde::Deserialize<'de> for CaseKey {
        fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            struct CaseKeyVisitor;

            impl<'de> Visitor<'de> for CaseKeyVisitor {
                type Value = CaseKey;

                fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                    formatter.write_str("string, bool, or number")
                }

                fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(CaseKey(value.to_string()))
                }

                fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    // Convert bool keys to "True"/"False" strings to match Jackett expectations
                    Ok(CaseKey(if value {
                        "True".to_string()
                    } else {
                        "False".to_string()
                    }))
                }

                fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(CaseKey(value.to_string()))
                }

                fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(CaseKey(value.to_string()))
                }

                fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(CaseKey(value.to_string()))
                }
            }

            deserializer.deserialize_any(CaseKeyVisitor)
        }
    }

    deserializer.deserialize_any(CaseMapVisitor)
}
