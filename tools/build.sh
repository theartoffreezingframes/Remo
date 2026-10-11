#!/usr/bin/env bash
# Concatenates the authoring parts into the single-file deliverable.
#
# The deploy path depends only on bash + node. python3 is used for the static
# reference gate (tools/check-refs.py); when it is absent we warn loudly and
# continue, so a host image without python3 can still produce a correct build.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="double-game.html"
DIST="dist"

{
  cat parts/00-head.html
  for f in parts/[1-9]*.js; do
    echo "// ==================== ${f##*/} ===================="
    cat "$f"
  done
  cat parts/99-tail.html
} > "$OUT"

# 1. syntax-check the inlined JS exactly as the browser will parse it
node tools/syntax-check.mjs "$OUT"

# 2. static reference gate (UI ids, material keys, dialogue targets, campaign
#    integrity, state-object references) — development-time correctness check
if command -v python3 >/dev/null 2>&1; then
  python3 tools/check-refs.py
else
  echo "WARNING: python3 not found — static reference gate (tools/check-refs.py) SKIPPED." >&2
  echo "WARNING: run 'npm run check' on a machine with python3 before shipping." >&2
fi

# 3. static-site output for Render / Netlify / any static host.
#    index.html IS the game, so the root URL loads it with no redirect hop.
mkdir -p "$DIST"
cp "$OUT" "$DIST/index.html"

echo "built $OUT ($(wc -c < "$OUT") bytes, $(wc -l < "$OUT") lines)"
echo "published $DIST/index.html ($(wc -c < "$DIST/index.html") bytes)"
