from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from src.services.sample_service import SampleService

router = APIRouter(prefix="/api/samples", tags=["samples"])


def get_sample_service() -> SampleService:
    return SampleService()


@router.post("/upload")
async def upload_sample(
    style_id: str,
    file: UploadFile = File(...),
    service: SampleService = Depends(get_sample_service),
) -> dict:
    """Upload a handwriting sample image for a given style."""
    if file.content_type not in ("image/png", "image/jpeg", "image/webp", "image/tiff"):
        raise HTTPException(status_code=400, detail="Unsupported image format")
    result = await service.upload(style_id=style_id, file=file)
    return result


@router.get("/{style_id}")
async def list_samples(
    style_id: str,
    service: SampleService = Depends(get_sample_service),
) -> dict:
    """List all samples for a given style."""
    samples = await service.list(style_id=style_id)
    return {"style_id": style_id, "samples": samples}


@router.delete("/{style_id}/{sample_id}")
async def delete_sample(
    style_id: str,
    sample_id: str,
    service: SampleService = Depends(get_sample_service),
) -> dict:
    """Delete a specific sample."""
    deleted = await service.delete(style_id=style_id, sample_id=sample_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sample not found")
    return {"deleted": True, "sample_id": sample_id}
