from __future__ import annotations

from pathlib import Path

from PIL import Image


def render_pdf_page(pdf_path: str | Path, page_num: int = 0, dpi: int = 300) -> Image.Image:
    """Render a single page of a PDF to a PIL Image at the given DPI.

    Requires PyMuPDF (imported as ``fitz``).
    """
    import fitz  # type: ignore[import-untyped]  # PyMuPDF

    doc = fitz.open(str(pdf_path))
    if page_num >= len(doc):
        raise IndexError(f"Page {page_num} out of range (doc has {len(doc)} pages)")

    page = doc[page_num]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img
