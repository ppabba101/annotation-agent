from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.services.generation_service import GenerationService

router = APIRouter(prefix="/api/generate", tags=["generation"])


class GenerationRequestBody(BaseModel):
    text: str
    style_id: str
    page_width: int = 2480
    page_height: int = 3508
    margin_top: int = 200
    margin_left: int = 200
    margin_right: int = 200
    line_height: int = 80


def get_generation_service() -> GenerationService:
    return GenerationService()


@router.post("")
async def generate(
    body: GenerationRequestBody,
    service: GenerationService = Depends(get_generation_service),
) -> dict:
    """Submit a text generation job and return a task_id."""
    task_id = await service.submit(body)
    return {"task_id": task_id, "status": "pending"}


@router.get("/{task_id}/status")
async def get_generation_status(
    task_id: str,
    service: GenerationService = Depends(get_generation_service),
) -> dict:
    """Poll the status of a generation task."""
    status = await service.get_status(task_id=task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.get("/{task_id}/result")
async def get_generation_result(
    task_id: str,
    service: GenerationService = Depends(get_generation_service),
) -> dict:
    """Retrieve the completed result of a generation task."""
    result = await service.get_result(task_id=task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not available")
    return result
