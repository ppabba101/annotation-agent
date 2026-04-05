import uuid

from src.workers.task_queue import TaskQueue, TaskStatus

_queue = TaskQueue()


class TrainingService:
    async def start_training(self, style_id: str) -> str:
        """Submit a training job for style_id and return a task_id."""

        async def _train() -> dict:
            # Placeholder: real implementation would invoke LoRATrainer
            return {"style_id": style_id, "message": "training complete (stub)"}

        task_id = await _queue.submit(_train())
        return task_id

    async def get_status(self, task_id: str) -> dict | None:
        status = _queue.get_status(task_id)
        if status is None:
            return None
        result = _queue.get_result(task_id) if status == TaskStatus.completed else None
        return {
            "task_id": task_id,
            "status": status.value,
            "result": result,
        }
