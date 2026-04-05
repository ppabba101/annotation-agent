from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from src.services.style_service import StyleService

router = APIRouter(prefix="/api/styles", tags=["styles"])


def get_style_service() -> StyleService:
    return StyleService()


@router.post("/upload")
async def upload_style(
    name: str = Form(...),
    images: list[UploadFile] = File(...),
    service: StyleService = Depends(get_style_service),
) -> dict:
    """Upload handwriting sample images to create a new style."""
    for img in images:
        if img.content_type not in ("image/png", "image/jpeg", "image/webp", "image/tiff"):
            raise HTTPException(status_code=400, detail=f"Unsupported image format: {img.content_type}")

    try:
        meta = await service.create_style(name=name, images=images)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "style_id": meta["id"],
        "name": meta["name"],
        "sample_count": meta["sample_count"],
    }


@router.get("")
async def list_styles(
    service: StyleService = Depends(get_style_service),
) -> list[dict]:
    """List all available styles."""
    return await service.list_styles()


@router.get("/{style_id}")
async def get_style(
    style_id: str,
    service: StyleService = Depends(get_style_service),
) -> dict:
    """Get metadata for a specific style."""
    meta = await service.get_style(style_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Style not found")
    return meta


@router.delete("/{style_id}")
async def delete_style(
    style_id: str,
    service: StyleService = Depends(get_style_service),
) -> dict:
    """Delete a style and all its associated data."""
    deleted = await service.delete_style(style_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Style not found")
    return {"deleted": True}
