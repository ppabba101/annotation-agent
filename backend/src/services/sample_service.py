import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from src.config import settings


class SampleService:
    def __init__(self) -> None:
        self._base = Path(settings.UPLOAD_DIR)

    def _style_dir(self, style_id: str) -> Path:
        return self._base / style_id

    async def upload(self, style_id: str, file: UploadFile) -> dict:
        style_dir = self._style_dir(style_id)
        style_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(file.filename or "sample.png").suffix or ".png"
        sample_id = uuid.uuid4().hex
        dest = style_dir / f"{sample_id}{ext}"

        contents = await file.read()
        max_bytes = settings.MAX_SAMPLE_SIZE_MB * 1024 * 1024
        if len(contents) > max_bytes:
            raise ValueError(
                f"File exceeds maximum size of {settings.MAX_SAMPLE_SIZE_MB} MB"
            )

        dest.write_bytes(contents)
        return {
            "sample_id": sample_id,
            "style_id": style_id,
            "filename": dest.name,
            "size_bytes": len(contents),
        }

    async def list(self, style_id: str) -> list[dict]:
        style_dir = self._style_dir(style_id)
        if not style_dir.exists():
            return []
        samples = []
        for p in sorted(style_dir.iterdir()):
            if p.is_file():
                samples.append(
                    {
                        "sample_id": p.stem,
                        "filename": p.name,
                        "size_bytes": p.stat().st_size,
                    }
                )
        return samples

    async def delete(self, style_id: str, sample_id: str) -> bool:
        style_dir = self._style_dir(style_id)
        if not style_dir.exists():
            return False
        for p in style_dir.iterdir():
            if p.stem == sample_id:
                p.unlink()
                return True
        return False
