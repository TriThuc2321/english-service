#!/usr/bin/env bash
# Usage: validate.sh <import.json>
# Runs the repo's own validateTestImport (the same check POST /tests/import
# does) and prints per-section coverage plus every issue. Exit code 1 = errors.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPTS/../../../.." && pwd)"
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

cd "$REPO"
IMPORT_FILE="$FILE" pnpm -s vitest run \
  --root "$SCRIPTS" --dir "$SCRIPTS" \
  --config "$SCRIPTS/vitest.config.mjs" \
  --silent=false --reporter=verbose 2>&1 |
  sed -n '/^stdout/,/^ *[✓×]/p;/AssertionError/,/^$/p'
exit "${PIPESTATUS[0]}"
