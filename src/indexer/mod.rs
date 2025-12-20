//! Indexer module - manages torrent indexer definitions and execution

pub mod definition;
pub mod downloader;
pub mod executor;
mod field_extractor;
pub mod filters;
mod manager;
pub mod native;
mod result_builder;
pub mod selector;
pub mod template;
pub mod traits;

pub use downloader::{AvailableIndexer, IndexerDownloader};
pub use executor::SearchExecutor;
pub use manager::IndexerManager;
pub use traits::SearchCapabilities;
