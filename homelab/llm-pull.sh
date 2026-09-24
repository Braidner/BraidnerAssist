#!/usr/bin/env bash
# Скачивает файлы модели с Hugging Face в библиотеку LLM-моделей
# (по умолчанию /srv/stack/llm/<org>/<repo>/) и ведёт манифест .pultra.json,
# который читает Pultra (GET /api/llm/models → карточки на /system).
#
# Usage:
#   llm-pull.sh <org/repo> <file> [<file>...]
#   nohup llm-pull.sh JonathanColetti/Qwen3.8-27B-Uncensored-GGUF \
#     Qwen3.8-27B-Uncensored-Q4_K_M.gguf mmproj-Qwen3.8-27B-Uncensored-F16.gguf \
#     > /dev/null 2>&1 &
#
# Env: LLM_ROOT (default /srv/stack/llm), HF_TOKEN (optional, для gated-репо).
# Докачка идемпотентна: повторный запуск продолжает .part-файлы (curl -C -).
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

REPO="$1"; shift
ROOT="${LLM_ROOT:-/srv/stack/llm}"
DIR="$ROOT/$REPO"
MANIFEST="$DIR/.pultra.json"
LOG="$DIR/.download.log"
mkdir -p "$DIR"
exec >>"$LOG" 2>&1

AUTH=()
[ -n "${HF_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $HF_TOKEN")

# manifest <status> [error] — пересобирает .pultra.json из HF tree API + аргументов
TREE="$(curl -fsSL "${AUTH[@]}" "https://huggingface.co/api/models/$REPO/tree/main?recursive=true")"
manifest() {
  STATUS="$1" ERROR="${2:-}" REPO="$REPO" TREE="$TREE" MANIFEST="$MANIFEST" \
  python3 - "${FILES[@]}" <<'PY'
import json, os, sys, datetime
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
path = os.environ["MANIFEST"]
prev = {}
if os.path.exists(path):
    try: prev = json.load(open(path))
    except Exception: pass
sizes = {f["path"]: f.get("size", 0) for f in json.loads(os.environ["TREE"]) if f.get("type") == "file"}
repo = os.environ["REPO"]
m = {
    "repo": repo,
    "source": "huggingface",
    "url": f"https://huggingface.co/{repo}",
    "files": [{"path": p, "size": sizes.get(p, 0)} for p in sys.argv[1:]],
    "status": os.environ["STATUS"],
    "error": os.environ["ERROR"] or None,
    "startedAt": prev.get("startedAt") or now,
    "updatedAt": now,
}
if m["status"] == "complete":
    m["completedAt"] = now
tmp = path + ".tmp"
json.dump(m, open(tmp, "w"), indent=2)
os.replace(tmp, path)
PY
}

FILES=("$@")
echo "[$(date -Is)] pull $REPO: ${FILES[*]}"
manifest downloading

for f in "${FILES[@]}"; do
  if [ -f "$DIR/$f" ]; then
    echo "[$(date -Is)] skip $f (exists)"
    continue
  fi
  echo "[$(date -Is)] get $f"
  if ! curl -sSfL --retry 5 --retry-delay 10 -C - "${AUTH[@]}" \
      -o "$DIR/$f.part" "https://huggingface.co/$REPO/resolve/main/$f"; then
    echo "[$(date -Is)] FAILED $f"
    manifest error "download failed: $f"
    exit 1
  fi
  mv "$DIR/$f.part" "$DIR/$f"
done

manifest complete
echo "[$(date -Is)] done $REPO"
