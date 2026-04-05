from src.workers.task_queue import TaskQueue

_queue = TaskQueue()


class AnnotationService:
    async def submit(self, body: object) -> str:
        """Submit an annotation job and return a task_id."""

        async def _annotate() -> dict:
            # Placeholder: real implementation would invoke AnnotationGenerator
            return {
                "annotation_type": body.annotation_type,
                "region": body.region.model_dump(),
                "style_id": body.style_id,
                "message": "annotation complete (stub)",
            }

        task_id = await _queue.submit(_annotate())
        return task_id
