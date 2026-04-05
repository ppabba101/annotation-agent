import logging

from src.config import settings
from src.ml.pipeline import GenerationPipeline, GenerationRequest
from src.workers.task_queue import TaskQueue, TaskStatus

logger = logging.getLogger(__name__)

_queue = TaskQueue()


def _build_pipeline() -> GenerationPipeline:
    if settings.GPU_PROVIDER == "modal":
        try:
            from src.ml.diffbrush_pipeline import DiffBrushPipeline
            return DiffBrushPipeline()
        except Exception as exc:
            logger.warning(
                "DiffBrushPipeline unavailable (%s), falling back to MockPipeline", exc
            )
    from src.ml.mock_pipeline import MockPipeline
    return MockPipeline()


_pipeline: GenerationPipeline = _build_pipeline()


class GenerationService:
    async def submit(self, body: object) -> str:
        request = GenerationRequest(
            text=body.text,
            style_id=body.style_id,
            page_width=body.page_width,
            page_height=body.page_height,
            margin_top=body.margin_top,
            margin_left=body.margin_left,
            margin_right=body.margin_right,
            line_height=body.line_height,
        )

        async def _run() -> dict:
            result = None
            async for update in _pipeline.generate_page(request):
                result = update
            if result is None:
                return {}
            from src.ml.pipeline import GenerationResult
            if isinstance(result, GenerationResult):
                return {
                    "image_url": result.image_url,
                    "lines": [
                        {
                            "image_url": ln.image_url,
                            "x": ln.x,
                            "y": ln.y,
                            "width": ln.width,
                            "height": ln.height,
                            "text_content": ln.text_content,
                        }
                        for ln in result.lines
                    ],
                }
            return {}

        task_id = await _queue.submit(_run())
        return task_id

    async def get_status(self, task_id: str) -> dict | None:
        status = _queue.get_status(task_id)
        if status is None:
            return None
        return {"task_id": task_id, "status": status.value}

    async def get_result(self, task_id: str) -> dict | None:
        status = _queue.get_status(task_id)
        if status != TaskStatus.completed:
            return None
        return _queue.get_result(task_id)
