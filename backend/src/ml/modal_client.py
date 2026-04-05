from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


class ModalClient:
    """Async client for calling DiffBrush Modal inference service."""

    def __init__(self) -> None:
        self._cls = None  # Lazy-initialized Modal class lookup

    def _get_cls(self):
        """Lazy lookup of the deployed Modal class."""
        if self._cls is None:
            import modal
            self._cls = modal.Cls.from_name("diffbrush-inference", "DiffBrushInference")
        return self._cls

    async def generate_line(self, text: str, style_image_bytes: bytes) -> bytes:
        """Generate a single handwriting line. Returns PNG bytes."""
        cls = self._get_cls()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: cls().generate_line.remote(text, style_image_bytes),
        )
        return result

    async def generate_lines_batch(
        self, texts: list[str], style_image_bytes: bytes
    ) -> list[bytes]:
        """Generate multiple lines with same style. Returns list of PNG bytes."""
        cls = self._get_cls()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: cls().generate_lines_batch.remote(texts, style_image_bytes),
        )
        return result

    async def is_available(self) -> bool:
        """Check if Modal service is reachable."""
        try:
            self._get_cls()
            return True
        except Exception:
            return False
