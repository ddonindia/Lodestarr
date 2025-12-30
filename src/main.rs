mod clients;
mod config;
mod db;
mod download;
mod search;
mod server;
mod torznab;
mod tui;
mod utils;

// Native indexer modules
mod error;
mod indexer;
mod models;

use anyhow::Result;
use clap::{Parser, Subcommand, ValueEnum};
use colored::Colorize;
use config::Config;
use download::perform_download;
use search::perform_search;
use tabled::{Table, Tabled, settings::Style};
use tracing_subscriber::{EnvFilter, fmt, prelude::*};
use utils::format_size;

#[derive(Debug, Clone, Copy, ValueEnum)]
enum LogLevel {
    /// No logs
    Off,
    /// Only errors
    Error,
    /// Errors and warnings
    Warn,
    /// Info, warnings and errors (default)
    Info,
    /// Debug logs
    Debug,
    /// All logs including trace
    Trace,
}

impl LogLevel {
    fn as_filter(&self) -> &str {
        match self {
            LogLevel::Off => "off",
            LogLevel::Error => "error",
            LogLevel::Warn => "warn",
            LogLevel::Info => "info",
            LogLevel::Debug => "debug",
            LogLevel::Trace => "trace",
        }
    }
}

#[derive(Parser)]
#[command(name = "lodestarr")]
#[command(about = "Lodestarr: The guiding star for finding and streaming torrents")]
#[command(version)]
struct Cli {
    /// Torznab API URL (overrides config)
    #[arg(short, long, env = "TORZNAB_URL")]
    url: Option<String>,

    /// API key (overrides config)
    #[arg(short = 'k', long, env = "TORZNAB_APIKEY")]
    apikey: Option<String>,

    /// Log level (can also use RUST_LOG env var)
    #[arg(short = 'l', long, value_enum, default_value = "info", global = true)]
    log_level: LogLevel,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Manage indexers
    Indexer {
        #[command(subcommand)]
        command: IndexerCommands,
    },

    /// Get server capabilities
    Caps {
        /// Indexer name to use (if multiple configured)
        #[arg(short, long)]
        indexer: Option<String>,
    },

    /// Search for torrents
    Search {
        /// Search query
        query: String,

        /// Search type: search, tvsearch, movie, music, book
        #[arg(short = 't', long, default_value = "search")]
        search_type: String,

        /// Select specific indexer(s) to search (comma-separated, or 'all')
        #[arg(short, long, default_value = "all")]
        indexer: String,

        /// Category filter (comma-separated IDs)
        #[arg(short, long)]
        cat: Option<String>,

        /// Season number
        #[arg(long)]
        season: Option<u32>,

        /// Episode number
        #[arg(long)]
        ep: Option<u32>,

        /// IMDB ID
        #[arg(long)]
        imdbid: Option<String>,

        /// TMDB ID
        #[arg(long)]
        tmdbid: Option<i32>,

        /// TVDB ID
        #[arg(long)]
        tvdbid: Option<i32>,

        /// Year
        #[arg(long)]
        year: Option<u32>,

        /// Limit per indexer
        #[arg(short, long, default_value = "20")]
        limit: u32,

        /// Output format: table, json, links
        #[arg(short, long, default_value = "table")]
        output: String,

        /// Interactive mode: select result to download
        #[arg(short = 'i', long)]
        interactive: bool,
    },

    /// Download a torrent file
    Download {
        /// Download URL from search results or magnet link
        url: String,

        /// Output file path (default: derived from URL)
        #[arg(short, long)]
        output: Option<String>,

        /// Force save as .magnet file (for magnet links)
        #[arg(long)]
        magnet: bool,
    },

    /// Start the web server
    Serve {
        /// Host to bind to
        #[arg(short = 'H', long, default_value = "0.0.0.0")]
        host: String,

        /// Port to listen on
        #[arg(short, long, default_value_t = 3420)]
        port: u16,
    },
}

#[derive(Subcommand)]
enum IndexerCommands {
    /// List installed native indexers (default) or proxied Torznab servers
    List {
        /// List proxied Torznab servers instead of native indexers
        #[arg(long)]
        proxied: bool,
    },
    /// Add a new indexer (proxied torznab server)
    Add {
        /// Name of the indexer
        #[arg(short, long)]
        name: String,
        /// URL of the Torznab API
        url: String,
        /// API Key
        #[arg(short, long)]
        apikey: Option<String>,
    },
    /// Remove an indexer (proxied by default, use --native for native indexers)
    #[command(visible_alias = "delete")]
    Remove {
        /// Name of the indexer to remove
        #[arg(short, long)]
        name: String,
        /// Remove a native indexer from active/native/ instead of proxied
        #[arg(long)]
        native: bool,
    },
    /// Download indexer definitions from Jackett GitHub
    Download {
        /// List available indexers from GitHub
        #[arg(long, conflicts_with_all = ["all", "names", "cache"])]
        list: bool,
        /// Download all available indexers to active/native (enables them)
        #[arg(long, conflicts_with_all = ["names", "cache"])]
        all: bool,
        /// Download all indexers to available/ folder (cache only, doesn't enable)
        #[arg(long, conflicts_with_all = ["all", "names"])]
        cache: bool,
        /// Download specific indexers (comma-separated names) to active/native
        #[arg(long, value_delimiter = ',')]
        names: Option<Vec<String>>,
    },
    /// Update existing native indexer definitions
    Update,
    /// Test a native indexer
    Test {
        /// Indexer name to test
        name: String,
        /// Search query to use for testing
        #[arg(short, long, default_value = "test")]
        query: String,
    },
}

#[derive(Tabled)]
struct ResultRow {
    #[tabled(rename = "#")]
    index: usize,
    #[tabled(rename = "Indexer")]
    indexer: String,
    #[tabled(rename = "Title")]
    title: String,
    #[tabled(rename = "Size")]
    size: String,
    #[tabled(rename = "S")]
    seeders: String,
    #[tabled(rename = "L")]
    leechers: String,
    #[tabled(rename = "Cat")]
    category: String,
}

#[derive(Tabled)]
struct IndexerRow {
    #[tabled(rename = "Name")]
    name: String,
    #[tabled(rename = "URL")]
    url: String,
    #[tabled(rename = "API Key")]
    apikey: String,
}

#[derive(Tabled)]
struct NativeIndexerRow {
    #[tabled(rename = "Name")]
    name: String,
    #[tabled(rename = "ID")]
    id: String,
    #[tabled(rename = "Type")]
    indexer_type: String,
    #[tabled(rename = "Language")]
    language: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize tracing/logging
    // Priority: RUST_LOG env var > CLI flag
    let filter = if std::env::var("RUST_LOG").is_ok() {
        EnvFilter::from_default_env()
    } else {
        EnvFilter::new(cli.log_level.as_filter())
    };

    tracing_subscriber::registry()
        .with(fmt::layer().with_target(false).with_thread_ids(false))
        .with(filter)
        .init();

    tracing::debug!("Lodestarr starting...");
    tracing::debug!("Log level: {:?}", cli.log_level);

    let mut config = Config::load()?;

    // Backward compatibility: if args provided, treat as a temporary "CLI" indexer
    let cli_indexer = if let Some(url) = cli.url {
        Some(config::IndexerConfig {
            name: "CLI".to_string(),
            url,
            apikey: cli.apikey.clone(),
        })
    } else {
        None
    };

    // Helper to get active clients
    let get_clients = |target_indexer: &str| -> Result<Vec<(String, torznab::TorznabClient)>> {
        let mut clients = Vec::new();

        // Priority 1: CLI Override
        if let Some(ref idx) = cli_indexer
            && (target_indexer == "all" || target_indexer == "CLI")
        {
            clients.push((
                idx.name.clone(),
                torznab::TorznabClient::new(
                    &idx.url,
                    idx.apikey.as_deref(),
                    config.proxy_url.as_deref(),
                )?,
            ));
        }

        // Priority 2: Configured Indexers
        if clients.is_empty() {
            // Only load config if no CLI override or if explicitly requested?
            // Better logic: if CLI args present, use ONLY CLI args unless "config" is requested?
            // Actually, keep it simple: If CLI args, use them. If config, use them.
            // If both, maybe merge?
            if let Some(ref _idx) = cli_indexer {
                // Already added above
            } else if target_indexer == "all" {
                for idx in &config.indexers {
                    clients.push((
                        idx.name.clone(),
                        torznab::TorznabClient::new(
                            &idx.url,
                            idx.apikey.as_deref(),
                            config.proxy_url.as_deref(),
                        )?,
                    ));
                }
            } else {
                // specific list
                for name in target_indexer.split(',') {
                    if let Some(idx) = config.get_indexer(name) {
                        clients.push((
                            idx.name.clone(),
                            torznab::TorznabClient::new(
                                &idx.url,
                                idx.apikey.as_deref(),
                                config.proxy_url.as_deref(),
                            )?,
                        ));
                    }
                }
            }
        }

        Ok(clients)
    };

    match cli.command {
        Some(Commands::Indexer { command }) => handle_indexer_command(command, &mut config).await?,
        Some(Commands::Caps { indexer }) => {
            handle_caps_command(indexer, &get_clients, &cli_indexer).await?
        }
        Some(Commands::Search {
            query,
            search_type,
            indexer,
            cat,
            season,
            ep,
            imdbid,
            tmdbid,
            tvdbid,
            year,
            limit,
            output,
            interactive,
        }) => {
            handle_search_command(
                query,
                search_type,
                indexer,
                cat,
                season,
                ep,
                imdbid,
                tmdbid,
                tvdbid,
                year,
                limit,
                output,
                interactive,
                &get_clients,
            )
            .await?
        }
        Some(Commands::Download {
            url,
            output,
            magnet,
        }) => handle_download_command(url, output, magnet, &get_clients).await?,
        Some(Commands::Serve { host, port }) => server::start_server(config, &host, port).await?,
        None => {
            let mut app = tui::App::new(config)?;
            return app.run().await;
        }
    }

    Ok(())
}

// ========== Command Handlers ==========

async fn handle_indexer_command(command: IndexerCommands, config: &mut Config) -> Result<()> {
    match command {
        IndexerCommands::List { proxied } => {
            if proxied {
                // List proxied torznab indexers
                if config.indexers.is_empty() {
                    println!("No proxied indexers configured.");
                    println!("Use 'lodestarr indexer add' to add a Torznab proxy");
                } else {
                    let rows: Vec<IndexerRow> = config
                        .indexers
                        .iter()
                        .map(|i| IndexerRow {
                            name: i.name.clone(),
                            url: i.url.clone(),
                            apikey: i
                                .apikey
                                .clone()
                                .map(|s| {
                                    if s.len() > 4 {
                                        format!("{}***", &s[..4])
                                    } else {
                                        "***".to_string()
                                    }
                                })
                                .unwrap_or("-".to_string()),
                        })
                        .collect();
                    println!("{}", Table::new(rows).with(Style::rounded()));
                }
            } else {
                // List native indexers from ~/.config/lodestarr/indexers/active/native (default)
                use indexer::IndexerManager;
                let active_native_path = config.get_active_native_path()?;
                println!(
                    "{} Loading indexers from: {}",
                    "ℹ".cyan(),
                    active_native_path.display()
                );

                let manager = IndexerManager::new(config.proxy_url.as_deref());
                let count = manager.load_definitions(&active_native_path).await?;

                if count == 0 {
                    println!(
                        "No native indexers installed in '{}'",
                        active_native_path.display()
                    );
                    println!("Use 'lodestarr indexer download --list' to see available indexers");
                } else {
                    let definitions = manager.list_all_definitions().await;
                    let rows: Vec<NativeIndexerRow> = definitions
                        .iter()
                        .map(|d| NativeIndexerRow {
                            name: d.name.clone(),
                            id: d.id.clone(),
                            indexer_type: d.indexer_type.clone(),
                            language: d.language.clone(),
                        })
                        .collect();
                    println!("\\n{} {} native indexers installed:\\n", "✓".green(), count);
                    println!("{}", Table::new(rows).with(Style::rounded()));
                }
            }
        }
        IndexerCommands::Add { name, url, apikey } => {
            config.add_indexer(name.clone(), url, apikey);
            config.save()?;
            println!("{} Added indexer '{}'", "✓".green(), name);
        }
        IndexerCommands::Remove { name, native } => {
            if native {
                // Remove native indexer from active/native/
                let active_native_path = config.get_active_native_path()?;
                let indexer_file = active_native_path.join(format!("{}.yml", name));

                if indexer_file.exists() {
                    std::fs::remove_file(&indexer_file)?;
                    println!(
                        "{} Removed native indexer '{}' from {}",
                        "✓".green(),
                        name,
                        indexer_file.display()
                    );
                } else {
                    println!(
                        "{} Native indexer '{}' not found at {}",
                        "✗".red(),
                        name,
                        indexer_file.display()
                    );
                }
            } else {
                // Remove proxied indexer from config
                if config.remove_indexer(&name) {
                    config.save()?;
                    println!("{} Removed proxied indexer '{}'", "✓".green(), name);
                } else {
                    println!("{} Proxied indexer '{}' not found", "✗".red(), name);
                }
            }
        }
        IndexerCommands::Download {
            list,
            all,
            cache,
            names,
        } => {
            use indexer::IndexerDownloader;

            let active_native_path = config.get_active_native_path()?;
            let available_path = config.get_available_indexers_path()?;
            // Create the directories if they don't exist
            std::fs::create_dir_all(&active_native_path)?;
            std::fs::create_dir_all(&available_path)?;

            let proxy_url = config.proxy_url.clone();
            let downloader = IndexerDownloader::with_available_dir(
                active_native_path.to_string_lossy().to_string(),
                proxy_url,
                Some(available_path.to_string_lossy().to_string()),
            );

            if list {
                // List available indexers
                println!("{}", "Fetching available indexers from GitHub...".cyan());
                let available = downloader.list_available().await?;

                println!(
                    "\n{} {} indexers available from Jackett GitHub\n",
                    "Found".green(),
                    available.len().to_string().cyan().bold()
                );

                for (i, indexer) in available.iter().enumerate() {
                    println!("  {}. {}", (i + 1).to_string().yellow(), indexer.name);
                }

                println!(
                    "\n{} lodestarr indexer download --names <name1>,<name2>,...",
                    "Usage:".cyan()
                );
                println!("{} lodestarr indexer download --all", "      ".cyan());
            } else if all {
                // Download all indexers
                println!("{}", "Downloading all indexers from GitHub...".cyan());
                let results = downloader.download_all().await?;

                let mut success_count = 0;
                let mut failed = Vec::new();

                for (name, result) in results {
                    match result {
                        Ok(_) => {
                            success_count += 1;
                            println!("{} Downloaded: {}", "✓".green(), name);
                        }
                        Err(e) => {
                            println!("{} Failed: {} - {}", "✗".red(), name, e);
                            failed.push((name.clone(), e));
                        }
                    }
                }

                println!("\n{} Download complete!", "=".repeat(50));
                println!("{}: {}", "Downloaded".green(), success_count);
                if !failed.is_empty() {
                    println!("{}: {}", "Failed".red(), failed.len());
                }
            } else if cache {
                // Download all indexers to available/ folder (cache only)
                println!(
                    "{}",
                    "Downloading all indexers to available/ cache...".cyan()
                );
                println!("{} Target: {}", "→".cyan(), available_path.display());

                match downloader.download_all_to_available().await {
                    Ok(count) => {
                        println!(
                            "\n{} Downloaded {} indexer definitions to cache",
                            "✓".green(),
                            count
                        );
                    }
                    Err(e) => {
                        println!("{} Failed to download: {}", "✗".red(), e);
                    }
                }
            } else if let Some(names_list) = names {
                // Download specific indexers
                println!(
                    "{} Downloading {} indexer(s)...",
                    "→".cyan(),
                    names_list.len()
                );

                let results = downloader.download_by_names(&names_list).await?;

                for (name, result) in results {
                    match result {
                        Ok(path) => {
                            println!("{} Downloaded: {} -> {}", "✓".green(), name, path);
                        }
                        Err(e) => {
                            println!("{} Failed: {} - {}", "✗".red(), name, e);
                        }
                    }
                }
            } else {
                println!(
                    "{} Please specify --list, --all, --cache, or --names",
                    "✗".red()
                );
                println!("{} lodestarr indexer download --list", "Usage:".cyan());
            }
        }
        IndexerCommands::Update => {
            use indexer::IndexerDownloader;

            let active_native_path = config.get_active_native_path()?;
            let indexers_dir = active_native_path.to_string_lossy().to_string();
            let proxy_url = config.proxy_url.clone();
            let downloader = IndexerDownloader::new(indexers_dir, proxy_url);

            println!("{}", "Updating existing indexers...".cyan());
            let results = downloader.update_existing().await?;

            if results.is_empty() {
                println!("{} No indexers to update", "ℹ".yellow());
            } else {
                let mut success_count = 0;
                for (name, result) in results {
                    match result {
                        Ok(_) => {
                            success_count += 1;
                            println!("{} Updated: {}", "✓".green(), name);
                        }
                        Err(e) => {
                            println!("{} Failed to update {}: {}", "✗".red(), name, e);
                        }
                    }
                }
                println!("\n{} Updated {} indexer(s)", "✓".green(), success_count);
            }
        }
        IndexerCommands::Test { name, query } => {
            use indexer::SearchExecutor;
            use models::SearchQuery;

            println!(
                "{} Testing indexer '{}' with query '{}'",
                "→".cyan(),
                name,
                query
            );

            // Load the indexer
            let proxy_url = config.proxy_url.as_deref();
            let manager = indexer::IndexerManager::new(proxy_url);
            let active_native_path = config.get_active_native_path()?;
            let count = manager.load_definitions(&active_native_path).await?;

            if count == 0 {
                anyhow::bail!(
                    "No indexers found in '{}' directory",
                    active_native_path.display()
                );
            }

            let indexer_def = manager
                .get_definition(&name)
                .await
                .ok_or_else(|| anyhow::anyhow!("Indexer '{}' not found", name))?;

            println!("{} Loaded indexer: {}", "✓".green(), indexer_def.name);

            // Execute a test search
            let executor = SearchExecutor::new(None)?;
            let search_query = SearchQuery {
                query: Some(query.clone()),
                ..Default::default()
            };

            println!("{} Executing search...", "→".cyan());

            match executor.search(&indexer_def, &search_query, None).await {
                Ok(results) => {
                    println!(
                        "\n{} Found {} result(s)\n",
                        "✓".green(),
                        results.len().to_string().cyan().bold()
                    );

                    for (i, result) in results.iter().take(5).enumerate() {
                        println!("{}. {}", (i + 1).to_string().yellow(), result.title);
                        if let Some(size) = result.size {
                            println!("   Size: {}", format_size(size));
                        }
                        if let Some(seeders) = result.seeders {
                            println!("   Seeders: {}", seeders);
                        }
                        println!();
                    }

                    if results.len() > 5 {
                        println!("... and {} more results", results.len() - 5);
                    }
                }
                Err(e) => {
                    println!("{} Search failed: {}", "✗".red(), e);
                    return Err(e);
                }
            }
        }
    }
    Ok(())
}

async fn handle_caps_command(
    indexer: Option<String>,
    get_clients: &impl Fn(&str) -> Result<Vec<(String, torznab::TorznabClient)>>,
    _cli_indexer: &Option<config::IndexerConfig>,
) -> Result<()> {
    let clients = get_clients(indexer.as_deref().unwrap_or("all"))?;
    if clients.is_empty() {
        anyhow::bail!("No indexers available. Use --url/--apikey or add an indexer.");
    }

    // Just take the first one for Caps check usually
    let (name, client) = &clients[0];
    println!("Fetching capabilities for {}...", name.cyan());

    let caps = client.get_caps().await?;
    println!("{}", "=== Server Capabilities ===".green().bold());
    println!();

    println!("{}", "Searching:".cyan().bold());
    for (search_type, params) in &caps.searching {
        println!("  {} - params: {}", search_type.yellow(), params.join(", "));
    }
    println!();

    println!("{}", "Categories:".cyan().bold());
    for cat in &caps.categories {
        println!("  {} - {}", cat.id.to_string().yellow(), cat.name);
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn handle_search_command(
    query: String,
    search_type: String,
    indexer: String,
    cat: Option<String>,
    season: Option<u32>,
    ep: Option<u32>,
    imdbid: Option<String>,
    tmdbid: Option<i32>,
    tvdbid: Option<i32>,
    year: Option<u32>,
    limit: u32,
    output: String,
    interactive: bool,
    get_clients: &impl Fn(&str) -> Result<Vec<(String, torznab::TorznabClient)>>,
) -> Result<()> {
    let clients = get_clients(&indexer)?;
    if clients.is_empty() {
        anyhow::bail!(
            "No indexers available. Use --url/--apikey or add an indexer via 'indexer add'."
        );
    }

    let params = torznab::SearchParams {
        query,
        search_type,
        cat,
        season,
        ep,
        imdbid,
        tmdbid,
        tvdbid,
        year,
        limit: Some(limit),
    };

    let all_results = perform_search(&clients, params).await;

    if all_results.is_empty() {
        println!("{}", "No results found.".yellow());
        return Ok(());
    }

    match output.as_str() {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&all_results)?);
        }
        "links" => {
            for result in &all_results {
                if let Some(ref link) = result.link {
                    println!("{}", link);
                }
            }
        }
        _ => {
            // Table output
            println!(
                "{} {} results",
                "Found".green(),
                all_results.len().to_string().cyan().bold()
            );
            println!();

            let rows: Vec<ResultRow> = all_results
                .iter()
                .enumerate()
                .take(limit as usize) // Apply limit to total display? User asked limit per indexer, but table can be huge.
                .map(|(i, r)| ResultRow {
                    index: i + 1,
                    indexer: r.indexer.clone().unwrap_or_default(),
                    title: if r.title.len() > 50 {
                        format!("{}...", &r.title[..47])
                    } else {
                        r.title.clone()
                    },
                    size: r.size.map(format_size).unwrap_or_default(),
                    seeders: r.seeders.map(|s| s.to_string()).unwrap_or("-".to_string()),
                    leechers: r.leechers.map(|l| l.to_string()).unwrap_or("-".to_string()),
                    category: r
                        .categories
                        .first()
                        .map(|c| c.to_string())
                        .unwrap_or_default(),
                })
                .collect();

            let table = Table::new(rows).with(Style::rounded()).to_string();
            println!("{}", table);

            if interactive {
                use std::io::Write;
                println!();
                print!("Enter the # of the result to download (or 'q' to quit): ");
                std::io::stdout().flush()?;

                let mut input = String::new();
                std::io::stdin().read_line(&mut input)?;
                let input = input.trim();

                if input != "q" && input != "quit" {
                    if let Ok(idx) = input.parse::<usize>() {
                        if idx > 0 && idx <= all_results.len() {
                            let result = &all_results[idx - 1];
                            // Prefer magnet if available? Or link? Usually link is better unless it's magnet-only
                            let url = result.link.clone().or(result.magnet.clone());

                            if let Some(dlink) = url {
                                println!("Selected: {}", result.title.cyan());

                                // Find the client used for this result
                                let client_name = result.indexer.as_deref().unwrap_or("");
                                let client = clients
                                    .iter()
                                    .find(|(n, _)| n == client_name)
                                    .map(|(_, c)| c)
                                    .or_else(|| clients.first().map(|(_, c)| c)); // Fallback

                                if let Some(client) = client {
                                    perform_download(
                                        client,
                                        &dlink,
                                        None,
                                        false,
                                        Some(&result.title),
                                    )
                                    .await?;
                                } else {
                                    println!(
                                        "{} Could not find client for indexer '{}'",
                                        "✗".red(),
                                        client_name
                                    );
                                }
                            } else {
                                println!(
                                    "{} No download link available for this result.",
                                    "✗".red()
                                );
                            }
                        } else {
                            println!("{} Invalid index number.", "✗".red());
                        }
                    } else {
                        println!("{} Invalid input.", "✗".red());
                    }
                }
            }
        }
    }
    Ok(())
}

async fn handle_download_command(
    url: String,
    output: Option<String>,
    magnet: bool,
    get_clients: &impl Fn(&str) -> Result<Vec<(String, torznab::TorznabClient)>>,
) -> Result<()> {
    let clients = get_clients("all")?;
    if clients.is_empty() {
        anyhow::bail!("No indexers available.");
    }
    let client = &clients[0].1;
    perform_download(client, &url, output, magnet, None).await?;
    Ok(())
}
