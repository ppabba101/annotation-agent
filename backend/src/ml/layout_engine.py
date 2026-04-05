from __future__ import annotations

import random
from dataclasses import dataclass

from src.ml.pipeline import GenerationRequest


@dataclass
class LineLayout:
    text: str
    x: int
    y: int
    width: int
    height: int


class LayoutEngine:
    """Compute per-line layout positions with slight random variation."""

    _JITTER = 4  # pixels of random offset per line

    def compute(self, request: GenerationRequest) -> list[LineLayout]:
        usable_width = (
            request.page_width - request.margin_left - request.margin_right
        )
        words = request.text.split()
        lines: list[str] = []
        current: list[str] = []
        # Simple word-wrap by character count approximation
        for word in words:
            current.append(word)
            if len(" ".join(current)) > 60:
                lines.append(" ".join(current[:-1]))
                current = [word]
        if current:
            lines.append(" ".join(current))

        layouts: list[LineLayout] = []
        for i, line_text in enumerate(lines):
            jitter_x = random.randint(-self._JITTER, self._JITTER)
            jitter_y = random.randint(-self._JITTER, self._JITTER)
            x = request.margin_left + jitter_x
            y = request.margin_top + i * request.line_height + jitter_y
            layouts.append(
                LineLayout(
                    text=line_text,
                    x=x,
                    y=y,
                    width=usable_width,
                    height=request.line_height,
                )
            )
        return layouts
