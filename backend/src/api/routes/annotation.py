from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.services.annotation_service import AnnotationService

router = APIRouter(prefix="/api/annotate", tags=["annotation"])


class AnnotationType(str, Enum):
    highlight = "highlight"
    underline = "underline"
    circle = "circle"
    arrow = "arrow"
    margin_note = "margin_note"


class Region(BaseModel):
    x: int
    y: int
    width: int
    height: int


class AnnotationRequestBody(BaseModel):
    annotation_type: AnnotationType
    region: Region
    style_id: str
    text: str | None = None  # used for margin_note


def get_annotation_service() -> AnnotationService:
    return AnnotationService()


@router.post("")
async def annotate(
    body: AnnotationRequestBody,
    service: AnnotationService = Depends(get_annotation_service),
) -> dict:
    """Submit an annotation job and return a task_id."""
    task_id = await service.submit(body)
    return {"task_id": task_id, "status": "pending"}
