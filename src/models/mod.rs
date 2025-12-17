//! Core data models for Ferracket

mod category;
mod search;
mod torrent;

pub use category::CATEGORIES;
pub use search::{SearchQuery, SearchType};
pub use torrent::TorrentResult;
