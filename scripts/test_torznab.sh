#!/bin/bash
# Lodestarr Torznab API Regression Tests
# Run with: ./scripts/test_torznab.sh
# Requires server running on localhost:3420

set -e

BASE_URL="${LODESTARR_URL:-http://localhost:3420}"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================="
echo "Lodestarr Torznab API Regression Tests"
echo "Base URL: $BASE_URL"
echo "============================================="
echo ""

# Helper function
check() {
    local name="$1"
    local url="$2"
    local expected="$3"
    
    echo -n "Testing: $name... "
    response=$(curl -s "$url" 2>/dev/null)
    
    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}PASS${NC}"
        ((PASS++)) || true
    else
        echo -e "${RED}FAIL${NC}"
        echo "  Expected to contain: $expected"
        echo "  Got: ${response:0:200}..."
        ((FAIL++)) || true
    fi
}

# Test 1: Server info endpoint
check "Server info" \
    "$BASE_URL/api/info" \
    '"name":"Lodestarr"'

# Test 2: Torznab caps endpoint returns XML
check "Torznab caps returns XML" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=caps" \
    '<?xml version="1.0" encoding="UTF-8"?>'

# Test 3: Caps contains server title
check "Caps contains server title" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=caps" \
    'title="Lodestarr - All Indexers"'

# Test 4: Caps contains search capability
check "Caps contains search capability" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=caps" \
    '<search available="yes"'

# Test 5: Caps contains tv-search capability
check "Caps contains tv-search" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=caps" \
    '<tv-search available="yes"'

# Test 6: Caps contains movie-search capability  
check "Caps contains movie-search" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=caps" \
    '<movie-search available="yes"'

# Test 7: Verify standard category exists (Movies)
check "Category 2000 (Movies) exists" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=caps" \
    'category id="2000" name="Movies"'

# Test 8: Search returns RSS/XML format
check "Search returns RSS XML" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=search&q=test" \
    'xmlns:torznab="http://torznab.com/schemas/2015/feed"'

# Test 9: TV search endpoint works
check "TV search endpoint works" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=tvsearch&q=test" \
    '<channel>'

# Test 10: Movie search endpoint works
check "Movie search endpoint works" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab?t=movie&q=test" \
    '<channel>'

# Test 11: Alt torznab/api path works
check "Alt /api path works" \
    "$BASE_URL/api/v2.0/indexers/all/results/torznab/api?t=caps" \
    '<caps>'

echo ""
echo "============================================="
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "============================================="

if [ $FAIL -gt 0 ]; then
    exit 1
fi
