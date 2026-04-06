"""
Generation pipeline protocol for handwriting synthesis.

Defines the contract between the inference backend and the rest of the system.
The pipeline produces stroke coordinate data (SVG path strings), NOT raster images.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Protocol


@dataclass
class GenerationRequest:
    """Request for handwriting generation."""
    text: str
    style_index: int = 0        # 0-12 for built-in RNN styles
    bias: float = 0.5           # 0.0 (messy) to 1.0 (neat)


@dataclass
class GenerationProgress:
    """Progress update during generation."""
    percent: float
    message: str


@dataclass
class StrokePathResult:
    """A single stroke path with SVG data and bounding box."""
    d: str              # SVG path d-attribute (M/C commands, Bezier curves)
    bbox_x: float
    bbox_y: float
    bbox_width: float
    bbox_height: float
    text_content: str


@dataclass
class StrokeGenerationResult:
    """Complete generation result with stroke paths for each line."""
    lines: list[StrokePathResult] = field(default_factory=list)
    total_width: float = 0.0
    total_height: float = 0.0


class GenerationPipeline(Protocol):
    """Protocol for handwriting generation backends.

    Implementations must produce stroke paths (SVG d-strings),
    not raster images.
    """

    async def generate(
        self, request: GenerationRequest
    ) -> AsyncIterator[GenerationProgress | StrokeGenerationResult]: ...

    async def is_ready(self) -> bool: ...
