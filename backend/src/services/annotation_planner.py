"""
Annotation planner service: HYBRID approach.

1. PyMuPDF extracts text with word-level bounding boxes
2. Claude analyzes content and returns SEMANTIC annotation plan
3. CoordinateResolver maps semantic references to pixel coordinates
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import fitz  # PyMuPDF

from src.ml.llm_client import analyze_page_for_annotations

logger = logging.getLogger(__name__)


@dataclass
class ResolvedAnnotation:
    """An annotation with resolved pixel coordinates."""
    type: str  # highlight, underline, circle, arrow, margin_note
    # For region-based annotations (highlight, underline, circle)
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    # For arrows
    from_x: float = 0.0
    from_y: float = 0.0
    to_x: float = 0.0
    to_y: float = 0.0
    # For margin notes
    text: str = ""
    max_width: float = 0.0  # max width in canvas pixels for margin notes
    # Styling
    color: str = "yellow"
    style_index: int = 0


@dataclass
class PageAnnotationPlan:
    """Complete annotation plan for a single page."""
    page_num: int
    annotations: list[ResolvedAnnotation] = field(default_factory=list)
    page_width: float = 0.0
    page_height: float = 0.0


def extract_text_with_positions(pdf_path: str, page_num: int) -> tuple[list[dict], float, float]:
    """Extract text blocks with bounding boxes from a PDF page.

    Uses PyMuPDF's get_text("dict") for paragraph-level blocks with positions.

    Returns:
        (text_blocks, page_width, page_height)
        Each block: {"text": str, "bbox": [x0, y0, x1, y1], "block": int, "line": int}
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]  # 0-indexed

    pw = page.rect.width
    ph = page.rect.height

    blocks = []
    text_dict = page.get_text("dict")

    for block_idx, block in enumerate(text_dict.get("blocks", [])):
        if block.get("type") != 0:  # Skip image blocks
            continue

        # Combine all lines in the block into one text
        lines_text = []
        for line in block.get("lines", []):
            spans_text = " ".join(span.get("text", "") for span in line.get("spans", []))
            if spans_text.strip():
                lines_text.append(spans_text.strip())

        full_text = " ".join(lines_text)
        if not full_text.strip():
            continue

        bbox = block.get("bbox", [0, 0, pw, ph])
        blocks.append({
            "text": full_text,
            "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
            "block": block_idx,
        })

    doc.close()
    return blocks, pw, ph


def resolve_coordinates(
    pdf_path: str,
    page_num: int,
    semantic_annotations: list[dict],
    page_width: float,
    page_height: float,
    canvas_width: float = 1000.0,
    canvas_height: float = 1000.0,
) -> list[ResolvedAnnotation]:
    """Map semantic annotation references to pixel coordinates.

    Uses fitz.Page.search_for() to find exact text positions,
    then converts PDF points to canvas pixels.
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]

    # Scale factors: PDF points → canvas pixels
    scale_x = canvas_width / page_width
    scale_y = canvas_height / page_height

    resolved: list[ResolvedAnnotation] = []

    for ann in semantic_annotations:
        ann_type = ann.get("type", "")

        if ann_type in ("highlight", "underline", "circle"):
            target_text = ann.get("target_text", "")
            if not target_text:
                continue

            # Search for the exact text on the page
            rects = page.search_for(target_text)
            if not rects:
                logger.warning("Text not found on page %d: %r", page_num, target_text[:50])
                continue

            # Use the first match
            rect = rects[0]
            resolved.append(ResolvedAnnotation(
                type=ann_type,
                x=rect.x0 * scale_x,
                y=rect.y0 * scale_y,
                width=(rect.x1 - rect.x0) * scale_x,
                height=(rect.y1 - rect.y0) * scale_y,
                color=ann.get("color", "yellow"),
            ))

        elif ann_type == "arrow":
            from_text = ann.get("from_text", "")
            to_text = ann.get("to_text", "")

            from_rects = page.search_for(from_text) if from_text else []
            to_rects = page.search_for(to_text) if to_text else []

            if from_rects and to_rects:
                fr = from_rects[0]
                tr = to_rects[0]
                resolved.append(ResolvedAnnotation(
                    type="arrow",
                    from_x=(fr.x0 + fr.x1) / 2 * scale_x,
                    from_y=(fr.y0 + fr.y1) / 2 * scale_y,
                    to_x=(tr.x0 + tr.x1) / 2 * scale_x,
                    to_y=(tr.y0 + tr.y1) / 2 * scale_y,
                ))

        elif ann_type == "margin_note":
            para_idx = ann.get("near_paragraph", 0)
            note_text = ann.get("text", "")

            if not note_text:
                continue

            # Find the target paragraph and the content right edge
            text_blocks = page.get_text("dict").get("blocks", [])
            text_block_idx = 0
            target_y = page_height * 0.1
            content_right_edge = page_width * 0.65  # default

            for block in text_blocks:
                if block.get("type") != 0:
                    continue
                bbox = block.get("bbox", [0, 0, 0, 0])
                # Track the rightmost text edge across all blocks
                if bbox[2] > content_right_edge:
                    content_right_edge = min(bbox[2], page_width * 0.75)
                if text_block_idx == para_idx:
                    target_y = bbox[1]
                text_block_idx += 1

            # Calculate margin space
            margin_start = content_right_edge + 10  # small padding
            available_width = page_width - margin_start - 10  # right page edge padding
            available_width = max(available_width, 30)  # minimum

            resolved.append(ResolvedAnnotation(
                type="margin_note",
                x=margin_start * scale_x,
                y=target_y * scale_y,
                width=available_width * scale_x,
                max_width=available_width * scale_x,
                text=note_text,
                style_index=ann.get("style_index", 0),
            ))

    doc.close()
    return resolved


async def plan_annotations_for_page(
    pdf_path: str,
    page_num: int,
    canvas_width: float = 1000.0,
    canvas_height: float = 1000.0,
    context: str | None = None,
    style_index: int = 0,
) -> PageAnnotationPlan:
    """Full pipeline: extract text → Claude analysis → coordinate resolution.

    Returns a PageAnnotationPlan with resolved pixel coordinates.
    """
    # 1. Extract text with positions
    text_blocks, pw, ph = extract_text_with_positions(pdf_path, page_num)

    if not text_blocks:
        logger.warning("No text found on page %d of %s", page_num, pdf_path)
        return PageAnnotationPlan(page_num=page_num, page_width=pw, page_height=ph)

    # 2. Claude analyzes content → semantic annotation plan
    semantic_plan = analyze_page_for_annotations(text_blocks, context=context)

    # Set style_index for margin notes
    for ann in semantic_plan:
        if ann.get("type") == "margin_note":
            ann["style_index"] = style_index

    # 3. Resolve semantic references to pixel coordinates
    resolved = resolve_coordinates(
        pdf_path, page_num, semantic_plan,
        page_width=pw, page_height=ph,
        canvas_width=canvas_width, canvas_height=canvas_height,
    )

    return PageAnnotationPlan(
        page_num=page_num,
        annotations=resolved,
        page_width=pw,
        page_height=ph,
    )
