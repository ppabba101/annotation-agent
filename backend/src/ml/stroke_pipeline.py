"""
Stroke-based handwriting generation pipeline using the RNN model.

Implements GenerationPipeline protocol:
  text → RNN inference (subprocess) → stroke processing → SVG Bezier paths
"""
from __future__ import annotations

import logging
from typing import AsyncIterator

from .pipeline import (
    GenerationPipeline,
    GenerationProgress,
    GenerationRequest,
    StrokeGenerationResult,
    StrokePathResult,
)
from .rnn_inference import RNNInferenceClient
from .stroke_processing import process_all_strokes

logger = logging.getLogger(__name__)

# Singleton inference client (keeps subprocess warm)
_client: RNNInferenceClient | None = None


def _get_client() -> RNNInferenceClient:
    global _client
    if _client is None:
        _client = RNNInferenceClient()
    return _client


class StrokePipeline:
    """GenerationPipeline implementation using RNN stroke synthesis."""

    async def generate(
        self, request: GenerationRequest
    ) -> AsyncIterator[GenerationProgress | StrokeGenerationResult]:
        yield GenerationProgress(percent=0.0, message="Starting stroke generation")

        client = _get_client()

        # Generate raw strokes via subprocess
        yield GenerationProgress(percent=10.0, message="Running RNN inference...")

        try:
            raw_strokes = client.generate_strokes(
                text=request.text,
                style_index=request.style_index,
                bias=request.bias,
            )
        except Exception as exc:
            logger.error("RNN inference failed: %s", exc)
            raise

        yield GenerationProgress(percent=60.0, message="Processing strokes...")

        # Convert raw offsets to SVG Bezier paths
        stroke_paths = process_all_strokes(raw_strokes)

        # Build result
        lines: list[StrokePathResult] = []
        from .rnn_inference import split_into_lines, sanitize_text

        text_lines = split_into_lines(sanitize_text(request.text))

        for i, path in enumerate(stroke_paths):
            text_content = text_lines[i] if i < len(text_lines) else ""
            lines.append(StrokePathResult(
                d=path.d,
                bbox_x=path.bbox["x"],
                bbox_y=path.bbox["y"],
                bbox_width=path.bbox["width"],
                bbox_height=path.bbox["height"],
                text_content=text_content,
            ))

        # Compute total dimensions
        total_width = max((p.bbox["width"] for p in stroke_paths), default=0.0)
        total_height = sum(60.0 for _ in stroke_paths)  # line_height = 60

        yield GenerationProgress(percent=100.0, message="Done")
        yield StrokeGenerationResult(
            lines=lines,
            total_width=total_width,
            total_height=total_height,
        )

    async def is_ready(self) -> bool:
        try:
            _get_client()
            return True
        except Exception:
            return False
