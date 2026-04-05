from fastapi import APIRouter, Depends, HTTPException

from src.services.training_service import TrainingService

router = APIRouter(prefix="/api/train", tags=["training"])


def get_training_service() -> TrainingService:
    return TrainingService()


@router.post("/{style_id}")
async def start_training(
    style_id: str,
    service: TrainingService = Depends(get_training_service),
) -> dict:
    """Start a LoRA training job for the given style."""
    task_id = await service.start_training(style_id=style_id)
    return {"task_id": task_id, "style_id": style_id, "status": "pending"}


@router.get("/{task_id}/status")
async def get_training_status(
    task_id: str,
    service: TrainingService = Depends(get_training_service),
) -> dict:
    """Get the status of a training job."""
    status = await service.get_status(task_id=task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status
