#!/bin/bash
# Browser tests (Playwright). Starts three local dev servers, runs every suite, stops them.
#   5180  demo mode (sample data, no Supabase)
#   5181  "live" mode pointed at a fake Supabase URL; the tests answer its requests themselves
#   5182  a deliberately unsafe secret key, to check the admin refuses to start
# Needs Playwright with Chromium: set PLAYWRIGHT=/path/to/node_modules/playwright if it
# isn't installed where Node can find it. Nothing here talks to the real Supabase or Stripe.
set -u
DIR=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$DIR/../.." && pwd)
OUT=${1:-${TMPDIR:-/tmp}/hh-test-output}; mkdir -p "$OUT/shots"
cd "$ROOT"
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY npx vite --port 5180 --strictPort >"$OUT/server-5180.log" 2>&1 &
P1=$!
VITE_SUPABASE_URL=https://testproj.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_testkey123 npx vite --port 5181 --strictPort >"$OUT/server-5181.log" 2>&1 &
P2=$!
VITE_SUPABASE_URL=https://testproj.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_secret_not_allowed npx vite --port 5182 --strictPort >"$OUT/server-5182.log" 2>&1 &
P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null; pkill -P $P1 2>/dev/null; pkill -P $P2 2>/dev/null; pkill -P $P3 2>/dev/null' EXIT
for port in 5180 5181 5182; do
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 0.5; done
done
pass=0; fail=0
for suite in "$DIR"/*.cjs; do
  out=$(node "$suite" "$OUT" 2>&1)
  p=$(echo "$out" | grep -c '^PASS'); f=$(echo "$out" | grep -cE '^FAIL|^Error|TimeoutError|^page errors')
  printf '%-24s PASS %3d  FAIL %d\n' "$(basename "$suite")" "$p" "$f"
  echo "$out" | grep -E '^FAIL|^Error|TimeoutError|^page errors' | head -5 | sed 's/^/    /'
  pass=$((pass + p)); fail=$((fail + f))
done
echo "TOTAL                    PASS $pass  FAIL $fail"
[ "$fail" -eq 0 ]
