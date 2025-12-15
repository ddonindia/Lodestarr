mod config;
mod download;
mod search;
mod server;
mod torznab;
mod tui;
mod utils;

use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::Colorize;
use config::Config;
use download::perform_download;
use search::perform_search;
use tabled::{settings::Style, Table, Tabled};
use utils::format_size;

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
    /// List configured indexers
    List,
    /// Add a new indexer
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
    #[command(visible_alias = "delete")]
    Remove {
        /// Name of the indexer
        #[arg(short, long)]
        name: String,
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

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
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
        if let Some(ref idx) = cli_indexer {
            if target_indexer == "all" || target_indexer == "CLI" {
                clients.push((
                    idx.name.clone(),
                    torznab::TorznabClient::new(&idx.url, idx.apikey.as_deref())?,
                ));
            }
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
                        torznab::TorznabClient::new(&idx.url, idx.apikey.as_deref())?,
                    ));
                }
            } else {
                // specific list
                for name in target_indexer.split(',') {
                    if let Some(idx) = config.get_indexer(name) {
                        clients.push((
                            idx.name.clone(),
                            torznab::TorznabClient::new(&idx.url, idx.apikey.as_deref())?,
                        ));
                    }
                }
            }
        }

        Ok(clients)
    };

    match cli.command {
        Some(Commands::Indexer { command }) => match command {
            IndexerCommands::List => {
                if config.indexers.is_empty() {
                    println!("No indexers configured.");
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
            }
            IndexerCommands::Add { name, url, apikey } => {
                config.add_indexer(name.clone(), url, apikey);
                config.save()?;
                println!("{} Added indexer '{}'", "✓".green(), name);
            }
            IndexerCommands::Remove { name } => {
                if config.remove_indexer(&name) {
                    config.save()?;
                    println!("{} Removed indexer '{}'", "✓".green(), name);
                } else {
                    println!("{} Indexer '{}' not found", "✗".red(), name);
                }
            }
        },

        Some(Commands::Caps { indexer }) => {
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
            let clients = get_clients(&indexer)?;
            if clients.is_empty() {
                anyhow::bail!("No indexers available. Use --url/--apikey or add an indexer via 'indexer add'.");
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
                                    let url = result.link.clone().or(result.magneturl.clone());

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
        }

        Some(Commands::Download {
            url,
            output,
            magnet,
        }) => {
            // Download handles URL directly, no client indexer selection needed usually unless it needs auth?
            // If it needs auth, we need a client. But which one?
            // Ideally URL has everything. If not, we fallback to CLI arg client or first config?
            // For now, let's assume we use the first available client just for its HTTP capabilities + API key if needed?
            // Actually download usually doesn't need API key if it's a direct link, BUT torznab links often need it.
            // Simplified: use CLI client if args, else first config.

            let clients = get_clients("all")?;
            if clients.is_empty() {
                anyhow::bail!("No indexers available.");
            }
            let client = &clients[0].1;

            perform_download(client, &url, output, magnet, None).await?;
        }

        Some(Commands::Serve { host, port }) => {
            // For Serve, we want to allow aggregation? Or just one upstream?
            // Implementation Plan said: "Update Search API to query selected indexers."
            // So server needs to support multiple indexers too.
            // Updating server.rs is complex. For now, let's pass the first client or a special "AggregatingClient".

            // Simplification: In this turn, I haven't updated server.rs to handle multi-indexer Aggregation perfectly.
            // But server.rs uses `TorznabClient`.
            // IMPORTANT: The user's request was to "add indexers". The Serve command currently takes ONE client.
            // I need to update `server.rs` to take `Config` or `Vec<Client>`.

            // Let's pass the config to start_server and let it build clients?
            // Or update server.rs to take `Config`.

            // Note: I will update server.rs in next step.
            // For now, let's create a connection to the first indexer if using old logic, or prepare for new logic.
            // Let's assume server::start_server will be updated to take `Config`.
            server::start_server(config, &host, port).await?;
        }

        None => {
            // TUI needs update too.
            let mut app = tui::App::new(config)?;
            return app.run().await;
        }
    }

    Ok(())
}
