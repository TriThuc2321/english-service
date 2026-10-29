#!/usr/bin/env bash
# Usage: render_pdf.sh <pdf> <out_dir> [dpi]
# Keeps PyMuPDF in its own venv so nothing is installed into the system Python.
set -euo pipefail

VENV="${IMPORT_TEST_VENV:-$HOME/.cache/import-test-venv}"
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" -q install pymupdf
fi

exec "$VENV/bin/python" -I "$(dirname "$0")/render_pdf.py" "$@"
