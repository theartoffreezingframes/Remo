#!/usr/bin/env bash
# Concatenates the authoring parts into the single-file deliverable.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="double-game.html"
{
  cat parts/00-head.html
  for f in parts/[1-9]*.js; do
    echo "// ==================== ${f##*/} ===================="
    cat "$f"
  done
  cat parts/99-tail.html
} > "$OUT"
# syntax-check the inlined JS exactly as the browser will parse it
python3 - <<'PY'
import re,subprocess,sys,tempfile,os
html=open('double-game.html',encoding='utf-8').read()
m=re.search(r'<script id="game-main">(.*)</script>', html, re.S)
if not m: sys.exit('could not locate game-main script block')
tmp=tempfile.NamedTemporaryFile('w',suffix='.mjs',delete=False,encoding='utf-8')
tmp.write(m.group(1)); tmp.close()
r=subprocess.run(['node','--check',tmp.name],capture_output=True,text=True)
print(r.stdout+r.stderr)
os.unlink(tmp.name)
sys.exit(r.returncode)
PY
python3 tools/check-refs.py
echo "built $OUT ($(wc -c < $OUT) bytes, $(wc -l < $OUT) lines)"
