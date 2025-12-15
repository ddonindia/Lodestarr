use crate::config::Config;
use crate::torznab::{SearchParams, TorrentResult, TorznabClient};
use anyhow::Result;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use futures::future::join_all;
use ratatui::{prelude::*, widgets::*};
use std::{io, time::Duration};
use tui_input::{backend::crossterm::EventHandler, Input};

enum AppState {
    Input,
    #[allow(dead_code)]
    IndexerSelect,
    #[allow(dead_code)]
    ApiKey, // Kept for editing specific indexer? Maybe simplify for now: TUI uses config, edit config via CLI.
    // Or maybe just show active indexer status.
    Searching,
    Results,
}

pub struct App {
    #[allow(dead_code)]
    config: Config,
    client_cache: Vec<(String, TorznabClient)>,
    input: Input,
    state: AppState,
    results: Vec<TorrentResult>,
    table_state: TableState,
    status_msg: String,
    // Indexer selection
    // Indexer selection
    #[allow(dead_code)]
    selected_indexers: Vec<String>, // IDs/Names. Empty = All.
}

impl App {
    pub fn new(config: Config) -> Result<Self> {
        let mut client_cache = Vec::new();
        for idx in &config.indexers {
            if let Ok(c) = TorznabClient::new(&idx.url, idx.apikey.as_deref()) {
                client_cache.push((idx.name.clone(), c));
            }
        }

        Ok(Self {
            config,
            client_cache,
            input: Input::default(),
            state: AppState::Input,
            results: Vec::new(),
            table_state: TableState::default(),
            status_msg: "Ready. Type search query (Tab to change focus).".to_string(),
            selected_indexers: Vec::new(), // Default to all
        })
    }

    // Refresh clients from config
    // Refresh clients from config
    #[allow(dead_code)]
    fn reload_clients(&mut self) {
        self.client_cache.clear();
        for idx in &self.config.indexers {
            if let Ok(c) = TorznabClient::new(&idx.url, idx.apikey.as_deref()) {
                self.client_cache.push((idx.name.clone(), c));
            }
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        // Setup terminal
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        let res = self.run_app(&mut terminal).await;

        // Restore terminal
        disable_raw_mode()?;
        execute!(
            terminal.backend_mut(),
            LeaveAlternateScreen,
            DisableMouseCapture
        )?;
        terminal.show_cursor()?;

        if let Err(err) = res {
            println!("{:?}", err);
        }

        Ok(())
    }

    async fn run_app<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        loop {
            terminal.draw(|f| self.ui(f))?;

            if event::poll(Duration::from_millis(100))? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == KeyEventKind::Press {
                        match self.state {
                            AppState::Input => match key.code {
                                KeyCode::Enter => {
                                    if !self.input.value().is_empty() {
                                        self.perform_search(terminal).await?;
                                    }
                                }
                                KeyCode::Esc => return Ok(()),
                                _ => {
                                    self.input.handle_event(&Event::Key(key));
                                }
                            },
                            AppState::Searching => {}
                            AppState::Results => {
                                match key.code {
                                    KeyCode::Down => {
                                        let i = match self.table_state.selected() {
                                            Some(i) => {
                                                if i >= self.results.len() - 1 {
                                                    0
                                                } else {
                                                    i + 1
                                                }
                                            }
                                            None => 0,
                                        };
                                        self.table_state.select(Some(i));
                                    }
                                    KeyCode::Up => {
                                        let i = match self.table_state.selected() {
                                            Some(i) => {
                                                if i == 0 {
                                                    self.results.len() - 1
                                                } else {
                                                    i - 1
                                                }
                                            }
                                            None => 0,
                                        };
                                        self.table_state.select(Some(i));
                                    }
                                    KeyCode::Enter => {
                                        self.handle_download(terminal).await?;
                                    }
                                    KeyCode::Char('m') => {
                                        // Save as magnet
                                        self.handle_save_magnet(terminal).await?;
                                    }
                                    KeyCode::Esc | KeyCode::Backspace => {
                                        self.state = AppState::Input;
                                        self.status_msg = "Ready. Type to search.".to_string();
                                        // self.results.clear(); // Keep results for reference? No, clear them
                                        // actually navigating back usually implies clearing focus
                                        self.table_state.select(None);
                                    }
                                    _ => {}
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    async fn handle_save_magnet<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        if let Some(i) = self.table_state.selected() {
            let (title, link) = if let Some(r) = self.results.get(i) {
                (r.title.clone(), r.link.clone())
            } else {
                (String::new(), None)
            };

            if let Some(link) = link {
                self.status_msg = format!("Saving magnet for '{}'...", title);
                terminal.draw(|f| self.ui(f))?;

                let filename = format!(
                    "{}.magnet",
                    title.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-', "_")
                );

                if let Err(e) = std::fs::write(&filename, link) {
                    self.status_msg = format!("Failed to save magnet: {}", e);
                } else {
                    self.status_msg = format!("Saved magnet to {}!", filename);
                }
            } else {
                self.status_msg = "No link available.".to_string();
            }
        }
        Ok(())
    }

    async fn perform_search<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        self.state = AppState::Searching;
        self.status_msg = format!("Searching for '{}'...", self.input.value());
        terminal.draw(|f| self.ui(f))?;

        // Determine active clients
        // For simplicity: Query ALL clients in cache, since explicit selection UI isn't built yet
        // In V2, add a screen to toggle indexers.
        if self.client_cache.is_empty() {
            self.status_msg =
                "No indexers configured! Use 'lodestarr indexer add' to add one.".to_string();
            self.state = AppState::Input;
            return Ok(());
        }

        let params = SearchParams {
            query: self.input.value().to_string(),
            search_type: "search".to_string(),
            ..Default::default()
        };

        let futures = self.client_cache.iter().map(|(name, client)| {
            let p = params.clone();
            let n = name.clone();
            async move {
                match client.search(&p).await {
                    Ok(mut res) => {
                        for r in &mut res {
                            r.indexer = Some(n.clone());
                        }
                        Ok::<Vec<TorrentResult>, (String, anyhow::Error)>(res)
                    }
                    Err(e) => Err((n, e)),
                }
            }
        });

        let results_lists: Vec<Result<Vec<TorrentResult>, _>> = join_all(futures).await;
        let mut all_results = Vec::new();
        for list in results_lists.into_iter().flatten() {
            all_results.extend(list);
        }

        // Sort
        all_results.sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0))); // Sort by seeders

        self.results = all_results;
        self.state = AppState::Results;
        self.table_state.select(Some(0));
        self.status_msg = format!(
            "Found {} results across {} indexers.",
            self.results.len(),
            self.client_cache.len()
        );

        Ok(())
    }

    async fn handle_download<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        if let Some(i) = self.table_state.selected() {
            let (url, title, indexer_name) = if let Some(r) = self.results.get(i) {
                (
                    r.link.clone(),
                    r.title.clone(),
                    r.indexer.clone().unwrap_or_default(),
                )
            } else {
                (None, String::new(), String::new())
            };

            if let Some(url) = url {
                self.status_msg = format!("Downloading '{}'...", title);
                terminal.draw(|f| self.ui(f))?;

                let filename = url
                    .split('/')
                    .next_back()
                    .and_then(|s| s.split('?').next())
                    .filter(|s| !s.is_empty())
                    .unwrap_or("download.torrent");

                let filename =
                    filename.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-', "_");

                // Find correct client
                // Fallback to first if not found (shouldn't happen)
                let client = self
                    .client_cache
                    .iter()
                    .find(|(n, _)| *n == indexer_name)
                    .map(|(_, c)| c)
                    .or_else(|| self.client_cache.first().map(|(_, c)| c));

                if let Some(client) = client {
                    match client.download(&url).await {
                        Ok(bytes) => {
                            if let Err(e) = std::fs::write(&filename, bytes) {
                                self.status_msg = format!("Failed to save: {}", e);
                            } else {
                                self.status_msg = format!("Saved to {}!", filename);
                            }
                        }
                        Err(e) => {
                            self.status_msg = format!("Download failed: {}", e);
                        }
                    }
                } else {
                    self.status_msg = "No indexer available for download.".to_string();
                }
            } else {
                self.status_msg = "No download link available.".to_string();
            }
        }
        Ok(())
    }

    fn ui(&mut self, f: &mut Frame) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Input
                Constraint::Min(1),    // Results
                Constraint::Length(1), // StatusBar
            ])
            .split(f.area());

        // Search Input
        let width = chunks[0].width.max(3) - 3;
        let scroll = self.input.visual_scroll(width as usize);
        let input = Paragraph::new(self.input.value())
            .style(match self.state {
                AppState::Input => Style::default().fg(Color::Yellow),
                _ => Style::default(),
            })
            .scroll((0, scroll as u16))
            .block(Block::default().borders(Borders::ALL).title("Search Query"));
        f.render_widget(input, chunks[0]);

        // Cursor
        if matches!(self.state, AppState::Input) {
            f.set_cursor_position((
                chunks[0].x + ((self.input.visual_cursor().max(scroll) - scroll) as u16) + 1,
                chunks[0].y + 1,
            ));
        }

        // Results Table
        let header_style = Style::default().fg(Color::Yellow);
        let selected_style = Style::default().add_modifier(Modifier::REVERSED);

        let header = ["Indexer", "Seed", "Leech", "Size", "Title"]
            .into_iter()
            .map(Cell::from)
            .collect::<Row>()
            .style(header_style)
            .height(1);

        fn format_size(size: Option<u64>) -> String {
            match size {
                Some(s) => {
                    const KB: u64 = 1024;
                    const MB: u64 = KB * 1024;
                    const GB: u64 = MB * 1024;
                    if s >= GB {
                        format!("{:.1} GB", s as f64 / GB as f64)
                    } else if s >= MB {
                        format!("{:.1} MB", s as f64 / MB as f64)
                    } else {
                        format!("{} B", s)
                    }
                }
                None => "-".to_string(),
            }
        }

        let rows = self.results.iter().map(|item| {
            let indexer = item.indexer.clone().unwrap_or_default();
            let seed = item
                .seeders
                .map(|s| s.to_string())
                .unwrap_or("-".to_string());
            let leech = item
                .leechers
                .map(|s| s.to_string())
                .unwrap_or("-".to_string());
            let size = format_size(item.size);

            let color = if item.seeders.unwrap_or(0) > 0 {
                Color::Green
            } else {
                Color::Red
            };

            Row::new(vec![
                Cell::from(indexer).style(Style::default().fg(Color::Cyan)),
                Cell::from(seed).style(Style::default().fg(color)),
                Cell::from(leech),
                Cell::from(size),
                Cell::from(item.title.clone()),
            ])
        });

        let t = Table::new(
            rows,
            [
                Constraint::Length(12),
                Constraint::Length(6),
                Constraint::Length(6),
                Constraint::Length(10),
                Constraint::Min(10),
            ],
        )
        .header(header)
        .block(Block::default().borders(Borders::ALL).title("Results"))
        .row_highlight_style(selected_style)
        .highlight_symbol(">> ");

        f.render_stateful_widget(t, chunks[1], &mut self.table_state);

        // Status Bar
        let status =
            Paragraph::new(self.status_msg.clone()).style(Style::default().fg(Color::Cyan));
        f.render_widget(status, chunks[2]);
    }
}
