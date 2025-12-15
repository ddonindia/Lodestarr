# Lodestarr Web UI

This is the frontend dashboard for Lodestarr, built with React, TypeScript, and Tailwind CSS.

## Overview

The Web UI provides a modern interface for connecting to your Torznab indexers (Jackett/Prowlarr), managing configurations, and searching across all aggregated sources.

## Tech Stack

- **Framework**: [React 19](https://react.dev)
- **Build Tool**: [Vite](https://vitejs.dev)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com)
- **Icons**: [Lucide React](https://lucide.dev)
- **Charts**: [Recharts](https://recharts.org)

## Development

### Prerequisites

- Node.js v20+
- npm

### Setup

```bash
cd web
npm install
```

### Running Locally

To start the development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

The dev server usually runs on `http://localhost:5173`. Make sure your Rust backend is running on `http://localhost:3420` to serve API requests (configure proxy if needed or rely on CORS).

## Building for Production

The build process compiles TSX/CSS into static assets in the `dist/` folder.

```bash
npm run build
```

The output `dist` folder is automatically embedded into the Rust binary at compile time using `rust-embed`.

## Integration with Backend

How it works:
1. `npm run build` generates `web/dist`.
2. `src/server.rs` uses `#[derive(RustEmbed)]` to embed `web/dist`.
3. The binary serves `index.html` for the root path and assets for static requests.
4. `build.rs` in the root automatically triggers `npm run build` during `cargo build` if assets are missing.
