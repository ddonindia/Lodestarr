#!/bin/bash
# Run the same checks as GitHub Actions CI locally
# Usage: ./scripts/ci-check.sh

set -e

echo "=== Running CI checks locally ==="

echo ""
echo "1. Checking code formatting..."
cargo fmt
echo "✓ Formatting OK"

echo ""
echo "2. Running clippy..."
cargo clippy -- -D warnings
echo "✓ Clippy OK"

echo ""
echo "3. Building..."
cargo build --verbose
echo "✓ Build OK"

echo ""
echo "4. Running tests..."
cargo test --verbose
echo "✓ Tests OK"

echo ""
echo "=== All CI checks passed! ==="
