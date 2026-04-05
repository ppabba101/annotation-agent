from __future__ import annotations

from pathlib import Path

from PIL import Image


def preprocess_sample(image_path: str | Path) -> Image.Image:
    """Load and preprocess a handwriting sample image.

    Current preprocessing steps:
    - Convert to RGB
    - Resize to a canonical 300 DPI A4 width (2480 px) while preserving aspect ratio

    Returns a PIL Image ready for the style encoder.
    """
    img = Image.open(str(image_path)).convert("RGB")

    target_width = 2480
    if img.width != target_width:
        ratio = target_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((target_width, new_height), Image.LANCZOS)

    return img
