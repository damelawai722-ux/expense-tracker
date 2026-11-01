#!/usr/bin/env bash
# Smoke test: sign in, then create one expense with the returned session cookie.
#
#   ./test-post.sh
#   BASE_URL=http://localhost:3000 TEST_USER=buffy TEST_PASS=secret123 ./test-post.sh
#
# The script registers the test user if it does not exist yet, so it can be
# re-run against the same server. Every expense route now requires a session,
# so the login step is not optional.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_USER="${TEST_USER:-smoke_test_user}"
TEST_PASS="${TEST_PASS:-smoke-test-password}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

# --- 1. Sign in (create the account first time round) -------------------------
echo "Logging in as $TEST_USER at $BASE_URL"
login_status=$(curl -sS -o /dev/null -w '%{http_code}' \
  -c "$COOKIES" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}" \
  "$BASE_URL/api/login")

if [ "$login_status" != "200" ]; then
  echo "No usable account ($login_status); registering instead"
  curl -sS -c "$COOKIES" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}" \
    "$BASE_URL/api/register"
  echo
fi

# --- 2. Confirm the session is real before posting ---------------------------
if ! curl -sS -b "$COOKIES" "$BASE_URL/api/me" | grep -q '"loggedIn":true'; then
  echo "FAILED: still not logged in after register/login" >&2
  exit 1
fi

# --- 3. Create an expense dated today ---------------------------------------
TODAY="$(date +%F)"
echo "POST /api/expenses (date $TODAY)"
curl -sS -b "$COOKIES" -H 'Content-Type: application/json' \
  -d "{\"amount\":150,\"category\":\"Food\",\"description\":\"Lunch\",\"date\":\"$TODAY\"}" \
  "$BASE_URL/api/expenses"
echo

# --- 4. Show that it was stored ---------------------------------------------
echo "GET /api/expenses"
curl -sS -b "$COOKIES" "$BASE_URL/api/expenses"
echo
