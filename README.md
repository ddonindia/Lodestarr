# Lodestarr

<p align="center">
  <img src="web/public/icon.png" alt="Lodestarr Icon" width="128" height="128" />
</p>


Lodestarr is a powerful, lightweight proxy for Torznab indexers. It aggregates search results from multiple sources (like Jackett, Prowlarr, or direct implementations) and provides a unified search API and a modern Web UI.

## Why Lodestarr?

The primary motivation behind Lodestarr is to provide a fresh, modern alternative to existing aggregator tools.

*   **Modern UI**: We believe managing your media sources should be a pleasant experience. Lodestarr features a sleek, responsive interface built with modern web technologies, moving away from the dated look of older tools.
*   **Lightweight & Fast**: Written in Rust, Lodestarr is designed to be extremely resource-efficient and performant, ensuring it runs smoothly even on low-power devices like Raspberry Pis without bogging down your system.

## Features

*   **Multi-Indexer Support**: Aggregate results from multiple Torznab feeds.
*   **Unified Search**: Search once, query all configured indexers.
*   **Web UI**: Modern, responsive React-based interface.
*   **TUI Mode**: Terminal User Interface for quick searches from the command line.
*   **Torrent Management**: Download capabilities and magnet link support.
*   **Persistent Configuration**: Easy management of indexers.

> **Work in Progress**: This project is currently in active development (v0.4.2.0). Features and APIs may change.

## Roadmap

*   [ ] Improve documentation
*   [ ] Advanced Filtering & Sorting
*   [ ] User Authentication
*   [ ] Implemenat of the indexer proxy, in Rust (fast & compatible with Jackett YAML definitions)

## Installation

### Prerequisites

*   Rust (latest stable)
*   Node.js (for building the Web UI)

### Building from Source

1.  Clone the repository.
2.  Build the binary:
```bash
    cargo build --release
```

The executable will be located at `target/release/lodestarr`.

## Docker

Lodestarr is available as a Docker container.

```bash
# Build the image
docker build -t lodestarr .

# Run with persistence
docker run -d \
  -p 3420:3420 \
  -v $(pwd)/config:/root/.config/lodestarr \
  lodestarr
```

## Usage

### Web Server

Start the Lodestarr web server:
```bash
./target/release/lodestarr serve
```

Access the UI at http://hostip:3420

### Command Line Interface

#### Manage Indexers

Add a new indexer:
```bash
./target/release/lodestarr indexer add --name MyIndexer --url "http://prowlarr:9696/1/api" --apikey "YOUR_KEY"
```

List configured indexers:
```bash
./target/release/lodestarr indexer list
```

Remove an indexer:
```bash
./target/release/lodestarr indexer remove --name MyIndexer
```

#### Search (CLI)

Search all indexers:
```bash
./target/release/lodestarr search "Ubuntu 22.04"
```

Search specific indexer:
```bash
./target/release/lodestarr search "Debian" --indexer MyIndexer
```

#### Example: Internet Archive

1. **Add the Indexer**:

```bash
./target/release/lodestarr indexer add --name internetarchive  "torznab_url" --apikey "key"
```

2. **Search for "Debian"**:

```bash
./target/release/lodestarr search "Debian" --indexer internetarchive
```

**Output**:

```text
Found 20 results

╭────┬─────────────────┬────────────────────────────────────────────────────┬──────────┬───┬───┬──────╮
│ #  │ Indexer         │ Title                                              │ Size     │ S │ L │ Cat  │
├────┼─────────────────┼────────────────────────────────────────────────────┼──────────┼───┼───┼──────┤
│ 1  │ internetarchive │ debian_classic_system_13                           │ 2.5 GB   │ 1 │ 2 │ 4000 │
│ 2  │ internetarchive │ Debian 13 Trixie                                   │ 784.1 MB │ 1 │ 2 │ 4000 │
│ 3  │ internetarchive │ Debian GNU Linux Bible                             │ 274.4 MB │ 1 │ 2 │ 7000 │
│ 4  │ internetarchive │ debian-10.13.0-amd64-netinst                       │ 337.0 MB │ 1 │ 2 │ 4000 │
│ 5  │ internetarchive │ Nils' K1v v1.26 Debian package                     │ 8.2 MB   │ 1 │ 2 │ 4000 │
│ 6  │ internetarchive │ debian-amd64-netinst-3cx                           │ 628.0 MB │ 1 │ 2 │ 8010 │
│ 7  │ internetarchive │ Debian 1.3 Image (QEMU Copy On Write 2)            │ 40.4 MB  │ 1 │ 2 │ 4000 │
│ 8  │ internetarchive │ debian-live-11.1.0-amd64-kde+nonfree.iso           │ 3.2 GB   │ 1 │ 2 │ 8000 │
│ 9  │ internetarchive │ Linux Mint Debian Edition (LMDE) 7 Cinnamon 64-bit │ 2.8 GB   │ 1 │ 2 │ 4000 │
│ 10 │ internetarchive │ debian-13.2.0-amd64-netinst                        │ 784.1 MB │ 1 │ 2 │ 4000 │
╰────┴─────────────────┴────────────────────────────────────────────────────┴──────────┴───┴───┴──────╯
```

#### Download

Download a torrent or magnet link:
  
```bash
./target/release/lodestarr download "magnet:?xt=urn:btih:..."
```

## Configuration

Configuration is stored in:
*   Linux: ~/.config/lodestarr/config.toml

## API

Lodestarr exposes a Torznab-compatible API at /api/v2.0/

*   Capabilities: /api/v2.0/indexers/all/caps
*   Search: /api/v2.0/search?q=query&t=search

## License

MIT
