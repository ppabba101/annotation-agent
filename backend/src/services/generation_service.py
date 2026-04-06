"""Generation service — routes requests to the stroke pipeline."""
import logging

from src.ml.pipeline import GenerationRequest, StrokeGenerationResult
from src.workers.task_queue import TaskQueue, TaskStatus

logger = logging.getLogger(__name__)

_queue = TaskQueue()


def _build_pipeline():
    from src.ml.stroke_pipeline import StrokePipeline
    return StrokePipeline()


_pipeline = _build_pipeline()


class GenerationService:
    async def submit(self, text: str, style_index: int = 0, bias: float = 0.5) -> str:
        request = GenerationRequest(
            text=text,
            style_index=style_index,
            bias=bias,
        )

        async def _run() -> dict:
            logger.info("Generation started: text=%r, style=%d, bias=%.2f",
                        request.text, request.style_index, request.bias)
            result = None
            try:
                async for update in _pipeline.generate(request):
                    logger.debug("Pipeline update: %s", type(update).__name__)
                    result = update
            except Exception:
                logger.exception("Pipeline error during generation")
                raise

            if result is None:
                logger.error("Pipeline returned no result")
                return {}

            if isinstance(result, StrokeGenerationResult):
                logger.info("Generation complete: %d lines", len(result.lines))
                return {
                    "lines": [
                        {
                            "d": ln.d,
                            "bbox": {
                                "x": ln.bbox_x,
                                "y": ln.bbox_y,
                                "width": ln.bbox_width,
                                "height": ln.bbox_height,
                            },
                            "text_content": ln.text_content,
                        }
                        for ln in result.lines
                    ],
                    "total_width": result.total_width,
                    "total_height": result.total_height,
                }
            logger.warning("Pipeline returned non-result: %s", type(result).__name__)
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
