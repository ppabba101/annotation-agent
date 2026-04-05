from __future__ import annotations

from uuid import uuid4

from fastapi import UploadFile

from src.ml.style_store import StyleStore


class StyleService:
    def __init__(self) -> None:
        self._store = StyleStore()

    async def create_style(self, name: str, images: list[UploadFile]) -> dict:
        style_id = str(uuid4())
        image_bytes = [await img.read() for img in images]
        return await self._store.save_style(style_id, name, image_bytes)

    async def get_style(self, style_id: str) -> dict | None:
        return await self._store.get_meta(style_id)

    async def list_styles(self) -> list[dict]:
        return await self._store.list_styles()

    async def delete_style(self, style_id: str) -> bool:
        return await self._store.delete_style(style_id)
