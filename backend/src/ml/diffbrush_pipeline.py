from __future__ import annotations

import logging
import uuid
from io import BytesIO
from pathlib import Path
from typing import AsyncIterator

from PIL import Image

from src.config import settings
from src.ml.charset import sanitize_text
from src.ml.layout_engine import LayoutEngine
from src.ml.modal_client import ModalClient
from src.ml.pipeline import (
    GenerationProgress,
    GenerationRequest,
    GenerationResult,
    LineResult,
)
from src.ml.style_store import StyleStore

logger = logging.getLogger(__name__)


class DiffBrushPipeline:
    """Implements GenerationPipeline using Modal DiffBrush GPU inference."""

    def __init__(self) -> None:
        self._layout = LayoutEngine()
        self._modal = ModalClient()
        self._style_store = StyleStore(settings.STYLES_DIR)
        self._output_dir = Path(settings.UPLOAD_DIR) / "_generated"

    def _ensure_output_dir(self) -> None:
        self._output_dir.mkdir(parents=True, exist_ok=True)

    async def generate_page(
        self, request: GenerationRequest
    ) -> AsyncIterator[GenerationProgress | GenerationResult]:
        self._ensure_output_dir()
        yield GenerationProgress(percent=0.0, message="Starting DiffBrush generation")

        # 1. Sanitize text
        clean_text = sanitize_text(request.text)

        # 2. Get style image from store (.npy tensor) and convert to PNG for Modal
        style_npy_bytes = await self._style_store.get_style_image(request.style_id)
        if style_npy_bytes is None:
            raise ValueError(f"Style '{request.style_id}' not found")
        style_bytes = self._npy_to_png(style_npy_bytes)

        # 3. Compute layout (splits text into lines)
        layout_request = GenerationRequest(
            text=clean_text,
            style_id=request.style_id,
            page_width=request.page_width,
            page_height=request.page_height,
            margin_top=request.margin_top,
            margin_left=request.margin_left,
            margin_right=request.margin_right,
            line_height=request.line_height,
        )
        layouts = self._layout.compute(layout_request)
        total = len(layouts)

        yield GenerationProgress(percent=5.0, message="Layout computed, generating handwriting...")

        # 4. Generate all lines via Modal (batch call, with per-line fallback)
        line_texts = [layout.text for layout in layouts]
        try:
            line_images_bytes = await self._modal.generate_lines_batch(line_texts, style_bytes)
        except Exception as exc:
            logger.warning("Batch generation failed (%s), falling back to per-line calls", exc)
            line_images_bytes = []
            for lt in line_texts:
                img = await self._modal.generate_line(lt, style_bytes)
                line_images_bytes.append(img)

        # 5. Compose page
        page = Image.new("RGB", (request.page_width, request.page_height), (255, 255, 255))
        usable_width = request.page_width - request.margin_left - request.margin_right
        line_results: list[LineResult] = []

        for i, (img_bytes, layout) in enumerate(zip(line_images_bytes, layouts)):
            line_img = Image.open(BytesIO(img_bytes)).convert("RGB")
            line_img = line_img.resize((usable_width, request.line_height), Image.LANCZOS)

            page.paste(line_img, (layout.x, layout.y))

            line_name = f"{uuid.uuid4().hex}_line{i}.png"
            line_path = self._output_dir / line_name
            line_img.save(str(line_path))

            line_results.append(
                LineResult(
                    image_url=f"/static/samples/_generated/{line_name}",
                    x=layout.x,
                    y=layout.y,
                    width=usable_width,
                    height=request.line_height,
                    text_content=layout.text,
                )
            )

            progress = 5.0 + (90.0 * (i + 1) / total)
            yield GenerationProgress(
                percent=round(progress, 1),
                message=f"Line {i + 1}/{total} composed",
            )

        # 6. Save full page
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
        clean = sanitize_text(new_text)

        style_npy_bytes = await self._style_store.get_style_image(request.style_id)
        if style_npy_bytes is None:
            raise ValueError(f"Style '{request.style_id}' not found")
        style_bytes = self._npy_to_png(style_npy_bytes)

        img_bytes = await self._modal.generate_line(clean, style_bytes)

        usable_width = request.page_width - request.margin_left - request.margin_right
        line_img = Image.open(BytesIO(img_bytes)).convert("RGB")
        line_img = line_img.resize((usable_width, request.line_height), Image.LANCZOS)

        name = f"{uuid.uuid4().hex}_regen_line{line_index}.png"
        path = self._output_dir / name
        line_img.save(str(path))

        y = request.margin_top + line_index * request.line_height
        return LineResult(
            image_url=f"/static/samples/_generated/{name}",
            x=request.margin_left,
            y=y,
            width=usable_width,
            height=request.line_height,
            text_content=clean,
        )

    @staticmethod
    def _npy_to_png(npy_bytes: bytes) -> bytes:
        """Convert a numpy .npy file (style tensor) to PNG image bytes."""
        import numpy as np
        arr = np.load(BytesIO(npy_bytes))  # shape: (1, H, W), float32 [0,1]
        img = Image.fromarray((arr[0] * 255).astype(np.uint8), mode="L")
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    async def is_ready(self) -> bool:
        return await self._modal.is_available()

    async def cancel(self, task_id: str) -> bool:
        return True  # Modal handles cancellation via container lifecycle
