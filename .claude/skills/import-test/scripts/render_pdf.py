"""Render every page of a test PDF to PNG and dump its text layer, if any.

Usage: render_pdf.py <pdf> <out_dir> [dpi]

Most collected test PDFs are scans with no text layer, so the PNGs are the
source of truth; text.txt only helps when the PDF was typeset.
"""

import sys
from pathlib import Path

import fitz


def main() -> None:
    pdf, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 120
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf)
    text_chars = 0
    with open(out_dir / "text.txt", "w", encoding="utf-8") as text_file:
        for i, page in enumerate(doc, start=1):
            page.get_pixmap(dpi=dpi).save(out_dir / f"p{i:02d}.png")
            text = page.get_text()
            text_chars += len(text.strip())
            text_file.write(f"--- page {i}\n{text}\n")

    kind = "typeset (text layer available)" if text_chars > 200 else "scanned (read the PNGs)"
    print(f"{doc.page_count} pages -> {out_dir} ; {kind}")


if __name__ == "__main__":
    main()
