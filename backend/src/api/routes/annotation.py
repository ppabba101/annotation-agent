"""Annotation API routes — autonomous and prompt-based annotation."""
from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from src.services.annotation_planner import plan_annotations_for_page
from src.workers.task_queue import TaskQueue, TaskStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/annotate", tags=["annotation"])

_queue = TaskQueue()
_upload_dir = Path("data/pdfs")
_upload_dir.mkdir(parents=True, exist_ok=True)


class PromptAnnotateRequest(BaseModel):
    pdf_path: str
    page_num: int = 1
    command: str = ""
    canvas_width: float = 1000.0
    canvas_height: float = 1000.0
    style_index: int = 0


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)) -> dict:
    """Upload a PDF for annotation."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")
    pdf_id = uuid.uuid4().hex
    save_path = _upload_dir / f"{pdf_id}.pdf"
    content = await file.read()
    save_path.write_bytes(content)
    logger.info("PDF uploaded: %s → %s", file.filename, save_path)
    return {"pdf_path": str(save_path), "pdf_id": pdf_id, "filename": file.filename}


@router.post("/autonomous")
async def annotate_autonomous(
    pdf_path: str = Form(...),
    start_page: int = Form(1),
    end_page: int = Form(0),
    canvas_width: float = Form(1000.0),
    canvas_height: float = Form(1000.0),
    context: str = Form(""),
    style_index: int = Form(0),
) -> dict:
    """Autonomously annotate PDF pages via Claude analysis."""
    if not os.path.exists(pdf_path):
        raise HTTPException(404, f"PDF not found: {pdf_path}")

    import fitz
    doc = fitz.open(pdf_path)
    total = len(doc)
    doc.close()
    if end_page <= 0:
        end_page = total
    end_page = min(end_page, total)

    async def _run() -> dict:
        results = {}
        for pn in range(start_page, end_page + 1):
            logger.info("Annotating page %d/%d", pn, end_page)
            plan = await plan_annotations_for_page(
                pdf_path, pn, canvas_width, canvas_height,
                context=context or None, style_index=style_index,
            )
            results[str(pn)] = {
                "page_num": plan.page_num,
                "annotations": [_serialize(a) for a in plan.annotations],
            }
        return {"pages": results, "total": len(results)}

    task_id = await _queue.submit(_run())
    return {"task_id": task_id, "status": "pending", "pages": f"{start_page}-{end_page}"}


@router.post("/prompt")
async def annotate_prompt(body: PromptAnnotateRequest) -> dict:
    """Annotate a single page based on user command."""
    if not os.path.exists(body.pdf_path):
        raise HTTPException(404, f"PDF not found: {body.pdf_path}")

    async def _run() -> dict:
        plan = await plan_annotations_for_page(
            body.pdf_path, body.page_num, body.canvas_width, body.canvas_height,
            context=body.command or None, style_index=body.style_index,
        )
        return {
            "page_num": plan.page_num,
            "annotations": [_serialize(a) for a in plan.annotations],
        }

    task_id = await _queue.submit(_run())
    return {"task_id": task_id, "status": "pending"}


@router.get("/{task_id}/status")
async def get_status(task_id: str) -> dict:
    status = _queue.get_status(task_id)
    if status is None:
        raise HTTPException(404, "Task not found")
    return {"task_id": task_id, "status": status.value}


@router.get("/{task_id}/result")
async def get_result(task_id: str) -> dict:
    status = _queue.get_status(task_id)
    if status != TaskStatus.completed:
        raise HTTPException(404, "Result not available")
    return _queue.get_result(task_id)


def _serialize(a) -> dict:
    return {
        "type": a.type,
        "x": a.x, "y": a.y, "width": a.width, "height": a.height,
        "from_x": a.from_x, "from_y": a.from_y,
        "to_x": a.to_x, "to_y": a.to_y,
        "text": a.text, "color": a.color, "style_index": a.style_index,
        "max_width": a.max_width,
    }
