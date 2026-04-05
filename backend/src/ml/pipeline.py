from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Protocol


@dataclass
class GenerationRequest:
    text: str
    style_id: str
    page_width: int = 2480   # A4 at 300 DPI
    page_height: int = 3508
    margin_top: int = 200
    margin_left: int = 200
    margin_right: int = 200
    line_height: int = 80


@dataclass
class GenerationProgress:
    percent: float
    message: str


@dataclass
class LineResult:
    image_url: str
    x: int
    y: int
    width: int
    height: int
    text_content: str


@dataclass
class GenerationResult:
    image_url: str
    lines: list[LineResult] = field(default_factory=list)


class GenerationPipeline(Protocol):
    async def generate_page(
        self, request: GenerationRequest
    ) -> AsyncIterator[GenerationProgress | GenerationResult]: ...

    async def regenerate_line(
        self, request: GenerationRequest, line_index: int, new_text: str
    ) -> LineResult: ...

    async def is_ready(self) -> bool: ...

    async def cancel(self, task_id: str) -> bool: ...
