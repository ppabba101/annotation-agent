"""Generation API routes — submit text, poll status, get stroke results."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.generation_service import GenerationService

router = APIRouter(prefix="/api/generate", tags=["generation"])

_service = GenerationService()


class GenerationRequestBody(BaseModel):
    text: str
    style_index: int = 0  # 0-12 for built-in styles
    bias: float = 0.5     # 0.0 (messy) to 1.0 (neat)


@router.post("")
async def generate(body: GenerationRequestBody) -> dict:
    """Submit a handwriting generation job."""
    task_id = await _service.submit(
        text=body.text,
        style_index=body.style_index,
        bias=body.bias,
    )
    return {"task_id": task_id, "status": "pending"}


@router.get("/{task_id}/status")
async def get_status(task_id: str) -> dict:
    """Poll generation task status."""
    status = await _service.get_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.get("/{task_id}/result")
async def get_result(task_id: str) -> dict:
    """Get completed stroke generation result."""
    result = await _service.get_result(task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not available")
    return result
