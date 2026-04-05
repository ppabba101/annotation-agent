from __future__ import annotations

import io
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image


class StyleStore:
    def __init__(self, base_dir: str = "data/styles") -> None:
        self._base = Path(base_dir)

    def _style_dir(self, style_id: str) -> Path:
        return self._base / style_id

    def _samples_dir(self, style_id: str) -> Path:
        return self._style_dir(style_id) / "samples"

    def _meta_path(self, style_id: str) -> Path:
        return self._style_dir(style_id) / "meta.json"

    def _style_image_path(self, style_id: str) -> Path:
        return self._style_dir(style_id) / "style_image.npy"

    def _preprocess_image(self, image_bytes: bytes) -> np.ndarray:
        """Convert image to grayscale float32 [0,1], resize height to 64, pad width to >= 512.

        DiffBrush expects style images at height 64 (IMG_H from training config).
        Returns array of shape (1, 64, W) where W >= 512.
        """
        img = Image.open(io.BytesIO(image_bytes)).convert("L")

        # Resize to height 64, preserving aspect ratio
        target_h = 64
        w, h = img.size
        new_w = max(int(w * target_h / h), 1)
        img = img.resize((new_w, target_h), Image.LANCZOS)

        arr = np.array(img, dtype=np.float32) / 255.0  # shape (64, W)

        if arr.shape[1] < 512:
            pad_width = 512 - arr.shape[1]
            arr = np.pad(arr, ((0, 0), (0, pad_width)), constant_values=1.0)

        return arr[np.newaxis, :, :]  # (1, 64, W)

    async def save_style(self, style_id: str, name: str, images: list[bytes]) -> dict:
        """Save raw images and preprocessed style tensor. Returns metadata dict."""
        if not images:
            raise ValueError("At least one image is required")

        style_dir = self._style_dir(style_id)
        samples_dir = self._samples_dir(style_id)
        samples_dir.mkdir(parents=True, exist_ok=True)

        for idx, raw in enumerate(images):
            (samples_dir / f"sample_{idx}.png").write_bytes(raw)

        processed = self._preprocess_image(images[0])
        np.save(str(self._style_image_path(style_id)), processed)

        meta: dict = {
            "id": style_id,
            "name": name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sample_count": len(images),
        }
        self._meta_path(style_id).write_text(json.dumps(meta, indent=2))

        return meta

    async def get_style_image(self, style_id: str) -> bytes | None:
        """Load the preprocessed style tensor as raw numpy bytes."""
        path = self._style_image_path(style_id)
        if not path.exists():
            return None
        return path.read_bytes()

    async def get_meta(self, style_id: str) -> dict | None:
        """Load meta.json for the given style."""
        path = self._meta_path(style_id)
        if not path.exists():
            return None
        return json.loads(path.read_text())

    async def list_styles(self) -> list[dict]:
        """Return metadata for all stored styles."""
        if not self._base.exists():
            return []
        styles: list[dict] = []
        for entry in sorted(self._base.iterdir()):
            if entry.is_dir():
                meta_path = entry / "meta.json"
                if meta_path.exists():
                    styles.append(json.loads(meta_path.read_text()))
        return styles

    async def delete_style(self, style_id: str) -> bool:
        """Remove the style directory. Returns True if it existed."""
        style_dir = self._style_dir(style_id)
        if not style_dir.exists():
            return False
        shutil.rmtree(style_dir)
        return True
