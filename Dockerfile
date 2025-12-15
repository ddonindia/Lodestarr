# Stage 1: Build Frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build Backend
FROM rust:1-bookworm AS backend
WORKDIR /app
# Copy manifests
COPY Cargo.toml Cargo.lock ./
# Create dummy main to cache deps
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm src/main.rs

# Copy source code
COPY src ./src
# Copy built frontend assets (Critical for rust-embed)
COPY --from=frontend /app/web/dist ./web/dist

# Touch main.rs to force rebuild with new source/assets
RUN touch src/main.rs
RUN cargo build --release

# Stage 3: Runtime
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend /app/target/release/lodestarr /usr/local/bin/lodestarr

# Create config directory
RUN mkdir -p /root/.config/lodestarr
VOLUME ["/root/.config/lodestarr"]

EXPOSE 3420
ENV RUST_LOG=info

CMD ["lodestarr", "serve", "--host", "0.0.0.0"]
