from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import AsyncIterator

from PIL import Image, ImageDraw, ImageFont

from src.config import settings
from src.ml.layout_engine import LayoutEngine
from src.ml.pipeline import (
    GenerationProgress,
    GenerationRequest,
    GenerationResult,
    LineResult,
)


class MockPipeline:
    """Implements GenerationPipeline using Pillow for quick local testing."""

    def __init__(self) -> None:
        self._layout = LayoutEngine()
        self._output_dir = Path(settings.UPLOAD_DIR) / "_generated"

    def _ensure_output_dir(self) -> None:
        self._output_dir.mkdir(parents=True, exist_ok=True)

    def _get_font(self, size: int = 36) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except OSError:
            return ImageFont.load_default()

    async def generate_page(
        self, request: GenerationRequest
    ) -> AsyncIterator[GenerationProgress | GenerationResult]:
        self._ensure_output_dir()
        yield GenerationProgress(percent=0.0, message="Starting generation")

        layouts = self._layout.compute(request)
        total = len(layouts)

        page = Image.new(
            "RGB", (request.page_width, request.page_height), color=(255, 255, 255)
        )
        draw = ImageDraw.Draw(page)
        font = self._get_font(36)

        line_results: list[LineResult] = []

        for i, layout in enumerate(layouts):
            await asyncio.sleep(0)  # yield to event loop
            draw.text((layout.x, layout.y), layout.text, fill=(10, 10, 10), font=font)

            # Save individual line image
            line_img = page.crop(
                (layout.x, layout.y, layout.x + layout.width, layout.y + layout.height)
            )
            line_name = f"{uuid.uuid4().hex}_line{i}.png"
            line_path = self._output_dir / line_name
            line_img.save(str(line_path))

            line_results.append(
                LineResult(
                    image_url=f"/static/samples/_generated/{line_name}",
                    x=layout.x,
                    y=layout.y,
                    width=layout.width,
                    height=layout.height,
                    text_content=layout.text,
                )
            )
            yield GenerationProgress(
                percent=round((i + 1) / total * 90, 1),
                message=f"Rendered line {i + 1}/{total}",
            )

        page_name = f"{uuid.uuid4().hex}_page.png"
        page_path = self._output_dir / page_name
        page.save(str(page_path))

        yield GenerationProgress(percent=100.0, message="Done")
        yield GenerationResult(
            image_url=f"/static/samples/_generated/{page_name}",
            lines=line_results,
        )

    async def regenerate_line(
        self, request: GenerationRequest, line_index: int, new_text: str
    ) -> LineResult:
        self._ensure_output_dir()
        font = self._get_font(36)
        img = Image.new(
            "RGB",
            (request.page_width - request.margin_left - request.margin_right, request.line_height),
            color=(255, 255, 255),
        )
        draw = ImageDraw.Draw(img)
        draw.text((0, 0), new_text, fill=(10, 10, 10), font=font)

        name = f"{uuid.uuid4().hex}_regen_line{line_index}.png"
        path = self._output_dir / name
        img.save(str(path))

        y = request.margin_top + line_index * request.line_height
        return LineResult(
            image_url=f"/static/samples/_generated/{name}",
            x=request.margin_left,
            y=y,
            width=img.width,
            height=img.height,
            text_content=new_text,
        )

    async def is_ready(self) -> bool:
        return True

    async def cancel(self, task_id: str) -> bool:
        return True
