from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.services.nl_command_service import NLCommandService

router = APIRouter(prefix="/api/nlcommand", tags=["nlcommand"])


class NLCommandRequest(BaseModel):
    command: str
    canvas_state: dict | None = None  # summary of current canvas state


def get_nl_service() -> NLCommandService:
    return NLCommandService()


@router.post("")
async def nl_command(
    body: NLCommandRequest,
    service: NLCommandService = Depends(get_nl_service),
) -> dict:
    """Parse a natural-language command and return a structured action list."""
    actions = await service.parse(command=body.command, canvas_state=body.canvas_state)
    return {"actions": actions}
