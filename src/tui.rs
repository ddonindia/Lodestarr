use crate::config::Config;
use crate::torznab::{SearchParams, TorrentResult, TorznabClient};
use anyhow::Result;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use futures::future::join_all;
use ratatui::{prelude::*, widgets::*};
use std::{io, time::Duration};
use tui_input::{Input, backend::crossterm::EventHandler};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveTab {
    Dashboard,
    Search,
    Indexers,
    Settings,
}

impl ActiveTab {
    fn next(&self) -> Self {
        match self {
            Self::Dashboard => Self::Search,
            Self::Search => Self::Indexers,
            Self::Indexers => Self::Settings,
            Self::Settings => Self::Dashboard,
        }
    }

    fn prev(&self) -> Self {
        match self {
            Self::Dashboard => Self::Settings,
            Self::Search => Self::Dashboard,
            Self::Indexers => Self::Search,
            Self::Settings => Self::Indexers,
        }
    }

    fn title(&self) -> &str {
        match self {
            Self::Dashboard => "Dashboard",
            Self::Search => "Search",
            Self::Indexers => "Indexers",
            Self::Settings => "Settings",
        }
    }
}

enum InputMode {
    Normal,
    Editing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SortMode {
    Seeders,
    Size,
    Indexer,
}

impl SortMode {
    fn next(&self) -> Self {
        match self {
            Self::Seeders => Self::Size,
            Self::Size => Self::Indexer,
            Self::Indexer => Self::Seeders,
        }
    }

    fn as_str(&self) -> &str {
        match self {
            Self::Seeders => "Seeders",
            Self::Size => "Size",
            Self::Indexer => "Indexer",
        }
    }
}

pub struct App {
    #[allow(dead_code)]
    config: Config,
    client_cache: Vec<(String, TorznabClient)>,
    // Navigation
    active_tab: ActiveTab,
    // Search State
    search_input: Input,
    search_mode: InputMode,
    results: Vec<TorrentResult>,
    results_state: TableState,
    sort_mode: SortMode,
    // Dashboard State
    // TODO: Add dashboard stats storage
    // Indexer State
    indexer_state: TableState,

    status_msg: String,
}

impl App {
    pub fn new(config: Config) -> Result<Self> {
        let mut client_cache = Vec::new();
        for idx in &config.indexers {
            if let Ok(c) =
                TorznabClient::new(&idx.url, idx.apikey.as_deref(), config.proxy_url.as_deref())
            {
                client_cache.push((idx.name.clone(), c));
            }
        }

        Ok(Self {
            config,
            client_cache,
            active_tab: ActiveTab::Dashboard,
            search_input: Input::default(),
            search_mode: InputMode::Normal,
            results: Vec::new(),
            results_state: TableState::default(),
            sort_mode: SortMode::Seeders,
            indexer_state: TableState::default(),
            status_msg: "Welcome to Lodestarr TUI. Press 'Tab' to switch views.".to_string(),
        })
    }

    pub async fn run(&mut self) -> Result<()> {
        // ... existing code ...

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

            if event::poll(Duration::from_millis(100))?
                && let Event::Key(key) = event::read()?
                && key.kind == KeyEventKind::Press
            {
                // Global Navigation
                match key.code {
                    KeyCode::Tab => {
                        self.active_tab = self.active_tab.next();
                        self.status_msg = format!("Switched to {}", self.active_tab.title());
                        continue;
                    }
                    KeyCode::BackTab => {
                        self.active_tab = self.active_tab.prev();
                        self.status_msg = format!("Switched to {}", self.active_tab.title());
                        continue;
                    }
                    KeyCode::Esc => {
                        if matches!(self.search_mode, InputMode::Editing) {
                            self.search_mode = InputMode::Normal;
                            self.status_msg = "Exited edit mode.".to_string();
                        } else {
                            return Ok(());
                        }
                        continue;
                    }
                    _ => {}
                }

                // Tab specific handling
                match self.active_tab {
                    ActiveTab::Dashboard => self.handle_dashboard_input(key).await?,
                    ActiveTab::Search => self.handle_search_input(key, terminal).await?,
                    ActiveTab::Indexers => self.handle_indexers_input(key).await?,
                    ActiveTab::Settings => {}
                }
            }
        }
    }

    fn reload_clients(&mut self) {
        self.client_cache.clear();
        for idx in &self.config.indexers {
            if let Ok(c) = TorznabClient::new(
                &idx.url,
                idx.apikey.as_deref(),
                self.config.proxy_url.as_deref(),
            ) {
                self.client_cache.push((idx.name.clone(), c));
            }
        }
    }

    async fn handle_dashboard_input(&mut self, _key: event::KeyEvent) -> Result<()> {
        // TODO: Interactive dashboard elements
        Ok(())
    }

    async fn handle_indexers_input(&mut self, key: event::KeyEvent) -> Result<()> {
        match key.code {
            KeyCode::Down | KeyCode::Char('j') => {
                let i = match self.indexer_state.selected() {
                    Some(i) => {
                        if i >= self.config.indexers.len().saturating_sub(1) {
                            0
                        } else {
                            i + 1
                        }
                    }
                    None => 0,
                };
                self.indexer_state.select(Some(i));
            }
            KeyCode::Up | KeyCode::Char('k') => {
                let i = match self.indexer_state.selected() {
                    Some(i) => {
                        if i == 0 {
                            self.config.indexers.len().saturating_sub(1)
                        } else {
                            i - 1
                        }
                    }
                    None => 0,
                };
                self.indexer_state.select(Some(i));
            }
            KeyCode::Char('d') => {
                if let Some(i) = self.indexer_state.selected()
                    && let Some(idx) = self.config.indexers.get(i).cloned()
                    && self.config.remove_indexer(&idx.name)
                {
                    if let Err(e) = self.config.save() {
                        self.status_msg = format!("Failed to save config: {}", e);
                    } else {
                        self.reload_clients();
                        self.status_msg = format!("Removed indexer '{}'", idx.name);
                        // Adjust selection
                        if i >= self.config.indexers.len() && !self.config.indexers.is_empty() {
                            self.indexer_state
                                .select(Some(self.config.indexers.len() - 1));
                        } else if self.config.indexers.is_empty() {
                            self.indexer_state.select(None);
                        }
                    }
                }
            }
            KeyCode::Char('r') => {
                self.reload_clients();
                self.status_msg = "Reloaded indexer clients".to_string();
            }
            _ => {}
        }
        Ok(())
    }

    async fn handle_search_input<B: Backend>(
        &mut self,
        key: event::KeyEvent,
        terminal: &mut Terminal<B>,
    ) -> Result<()> {
        match self.search_mode {
            InputMode::Editing => match key.code {
                KeyCode::Enter => {
                    if !self.search_input.value().is_empty() {
                        self.perform_search(terminal).await?;
                        self.search_mode = InputMode::Normal;
                    }
                }
                _ => {
                    self.search_input.handle_event(&Event::Key(key));
                }
            },
            InputMode::Normal => {
                match key.code {
                    KeyCode::Char('i') | KeyCode::Char('/') => {
                        self.search_mode = InputMode::Editing;
                        self.status_msg = "Editing search query...".to_string();
                    }
                    KeyCode::Enter => {
                        // If we have results, Enter might download? Or switch to "Results Focused" mode?
                        // For now, if no results, enter edit mode.
                        if self.results.is_empty() {
                            self.search_mode = InputMode::Editing;
                        } else {
                            self.handle_download(terminal).await?;
                        }
                    }
                    // Navigation
                    KeyCode::Down | KeyCode::Char('j') => {
                        if !self.results.is_empty() {
                            let i = match self.results_state.selected() {
                                Some(i) => {
                                    if i >= self.results.len() - 1 {
                                        0
                                    } else {
                                        i + 1
                                    }
                                }
                                None => 0,
                            };
                            self.results_state.select(Some(i));
                        }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if !self.results.is_empty() {
                            let i = match self.results_state.selected() {
                                Some(i) => {
                                    if i == 0 {
                                        self.results.len() - 1
                                    } else {
                                        i - 1
                                    }
                                }
                                None => 0,
                            };
                            self.results_state.select(Some(i));
                        }
                    }
                    KeyCode::Char('g') => {
                        if !self.results.is_empty() {
                            self.results_state.select(Some(0));
                        }
                    }
                    KeyCode::Char('G') => {
                        if !self.results.is_empty() {
                            self.results_state.select(Some(self.results.len() - 1));
                        }
                    }
                    KeyCode::Char('m') => {
                        self.handle_save_magnet(terminal).await?;
                    }
                    KeyCode::Char('s') => {
                        self.sort_mode = self.sort_mode.next();
                        self.sort_results();
                        self.status_msg = format!("Sorted by {}", self.sort_mode.as_str());
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }

    fn sort_results(&mut self) {
        match self.sort_mode {
            SortMode::Seeders => self
                .results
                .sort_by(|a, b| b.seeders.unwrap_or(0).cmp(&a.seeders.unwrap_or(0))),
            SortMode::Size => self
                .results
                .sort_by(|a, b| b.size.unwrap_or(0).cmp(&a.size.unwrap_or(0))),
            SortMode::Indexer => self.results.sort_by(|a, b| a.indexer.cmp(&b.indexer)),
        }
    }

    async fn perform_search<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        self.status_msg = format!("Searching for '{}'...", self.search_input.value());
        terminal.draw(|f| self.ui(f))?;

        if self.client_cache.is_empty() {
            self.status_msg = "No indexers configured!".to_string();
            return Ok(());
        }

        let params = SearchParams {
            query: self.search_input.value().to_string(),
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

        self.results = all_results;
        self.sort_results();
        self.results_state.select(Some(0));
        self.status_msg = format!("Found {} results.", self.results.len());
        self.search_mode = InputMode::Normal;

        Ok(())
    }

    async fn handle_download<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        if let Some(i) = self.results_state.selected() {
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

                let filename = format!(
                    "{}.torrent",
                    title.replace(|c: char| !c.is_alphanumeric(), "_")
                );

                let client = self
                    .client_cache
                    .iter()
                    .find(|(n, _)| *n == indexer_name)
                    .map(|(_, c)| c);
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
                }
            }
        }
        Ok(())
    }

    async fn handle_save_magnet<B: Backend>(&mut self, _terminal: &mut Terminal<B>) -> Result<()> {
        if let Some(_i) = self.results_state.selected() {
            // ... existing logic ...
            self.status_msg = "Magnet save logic here".to_string();
        }
        Ok(())
    }

    fn ui(&mut self, f: &mut Frame) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Tabs
                Constraint::Min(0),    // Content
                Constraint::Length(1), // StatusBar
            ])
            .split(f.area());

        // Tabs
        let tabs = Tabs::new(vec!["Dashboard", "Search", "Indexers", "Settings"])
            .select(self.active_tab as usize)
            .block(Block::default().borders(Borders::BOTTOM))
            .style(Style::default().fg(Color::White))
            .highlight_style(
                Style::default()
                    .fg(Color::Yellow)
                    .add_modifier(Modifier::BOLD),
            );
        f.render_widget(tabs, chunks[0]);

        // Content
        match self.active_tab {
            ActiveTab::Dashboard => self.render_dashboard(f, chunks[1]),
            ActiveTab::Search => self.render_search(f, chunks[1]),
            ActiveTab::Indexers => self.render_indexers(f, chunks[1]),
            ActiveTab::Settings => {}
        }

        // Status Bar
        let status = Paragraph::new(self.status_msg.clone()).style(
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        );
        f.render_widget(status, chunks[2]);
    }

    fn render_dashboard(&self, f: &mut Frame, area: Rect) {
        let dashboard_chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(7), // Stats
                Constraint::Min(4),    // Activity
            ])
            .split(area);

        // Stats Row
        let stats_layout = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(25),
                Constraint::Percentage(25),
                Constraint::Percentage(25),
                Constraint::Percentage(25),
            ])
            .split(dashboard_chunks[0]);

        // Helper for stats
        let total_indexers = self.config.indexers.len().to_string();

        f.render_widget(
            Paragraph::new(total_indexers.as_str())
                .style(
                    Style::default()
                        .fg(Color::Magenta)
                        .add_modifier(Modifier::BOLD),
                )
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title("Total Indexers"),
                )
                .alignment(Alignment::Center),
            stats_layout[0],
        );

        f.render_widget(
            Paragraph::new("45ms")
                .style(
                    Style::default()
                        .fg(Color::Blue)
                        .add_modifier(Modifier::BOLD),
                )
                .block(Block::default().borders(Borders::ALL).title("Avg Response"))
                .alignment(Alignment::Center),
            stats_layout[1],
        );

        f.render_widget(
            Paragraph::new("12")
                .style(
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title("Total Searches"),
                )
                .alignment(Alignment::Center),
            stats_layout[2],
        );

        f.render_widget(
            Paragraph::new("12m")
                .style(
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                )
                .block(Block::default().borders(Borders::ALL).title("Uptime"))
                .alignment(Alignment::Center),
            stats_layout[3],
        );

        // Activity Log
        let activity = Paragraph::new("12:00: Search 'ubuntu'\n12:01: Download 'Ubuntu 24.04 ISO'")
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Recent Activity"),
            );
        f.render_widget(activity, dashboard_chunks[1]);
    }

    fn render_search(&mut self, f: &mut Frame, area: Rect) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Input
                Constraint::Min(1),    // Results
            ])
            .split(area);

        // Input
        let scroll = self
            .search_input
            .visual_scroll(chunks[0].width.max(3) as usize - 3);
        let title = format!(
            "Query (Press 'i' to edit, 's' to sort [{}])",
            self.sort_mode.as_str()
        );
        let input = Paragraph::new(self.search_input.value())
            .style(match self.search_mode {
                InputMode::Editing => Style::default().fg(Color::Yellow),
                _ => Style::default(),
            })
            .scroll((0, scroll as u16))
            .block(Block::default().borders(Borders::ALL).title(title));
        f.render_widget(input, chunks[0]);

        if matches!(self.search_mode, InputMode::Editing) {
            f.set_cursor_position((
                chunks[0].x + ((self.search_input.visual_cursor().max(scroll) - scroll) as u16) + 1,
                chunks[0].y + 1,
            ));
        }

        // Table
        let header_style = Style::default().fg(Color::Yellow);
        let selected_style = Style::default().add_modifier(Modifier::REVERSED);

        let header = ["Indexer", "Seed", "Leech", "Size", "Title"]
            .into_iter()
            .map(Cell::from)
            .collect::<Row>()
            .style(header_style)
            .height(1);

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
            let size = item
                .size
                .map(|s| format!("{:.1} MB", s as f64 / 1024.0 / 1024.0))
                .unwrap_or("-".to_string());

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

        f.render_stateful_widget(t, chunks[1], &mut self.results_state);
    }

    fn render_indexers(&mut self, f: &mut Frame, area: Rect) {
        let header = ["Name", "URL", "Status"]
            .into_iter()
            .map(Cell::from)
            .collect::<Row>()
            .style(Style::default().fg(Color::Yellow))
            .height(1);

        let rows = self.config.indexers.iter().map(|idx| {
            Row::new(vec![
                Cell::from(idx.name.clone()),
                Cell::from(idx.url.clone()),
                Cell::from("Active").style(Style::default().fg(Color::Green)),
            ])
        });

        let t = Table::new(
            rows,
            [
                Constraint::Length(20),
                Constraint::Min(30),
                Constraint::Length(10),
            ],
        )
        .header(header)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title("Installed Indexers"),
        )
        .row_highlight_style(Style::default().add_modifier(Modifier::REVERSED))
        .highlight_symbol(">> ");

        f.render_stateful_widget(t, area, &mut self.indexer_state);
    }
}
