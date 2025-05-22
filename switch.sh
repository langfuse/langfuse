#!/usr/bin/env bash
set -euo pipefail

# flip "final" to point to "ee" or "foss"
usage() { echo "Usage: $0 [ee|foss]" >&2; exit 1; }

choice=${1:-}; [[ $choice == ee || $choice == foss ]] || usage

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK="$ROOT/final"
TARGET="$ROOT/$choice"

# First try GNU coreutils (has -T); fall back to BSD if that fails.
if ln -sfnT "$TARGET" "$LINK" 2>/dev/null; then       # GNU ln
  echo "✔ final → $choice (GNU ln)"
else                                                  # macOS/BSD ln
  ln -sfn  "$TARGET" "$LINK"
  echo "✔ final → $choice (BSD ln)"
fi
