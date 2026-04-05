from __future__ import annotations

import asyncio
import uuid
from enum import Enum
from typing import Any, Coroutine


class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class _TaskEntry:
    def __init__(self, coro: Coroutine[Any, Any, Any]) -> None:
        self.coro = coro
        self.status: TaskStatus = TaskStatus.pending
        self.result: Any = None
        self.error: str | None = None


class TaskQueue:
    """In-process async task queue backed by asyncio.Queue.

    A background worker loop processes tasks one at a time. The queue is
    started lazily on first submit so it works without a running event loop
    at import time.
    """

    def __init__(self) -> None:
        self._tasks: dict[str, _TaskEntry] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None

    def _ensure_worker(self) -> None:
        if self._worker_task is None or self._worker_task.done():
            loop = asyncio.get_event_loop()
            self._worker_task = loop.create_task(self._worker())

    async def _worker(self) -> None:
        while True:
            task_id = await self._queue.get()
            entry = self._tasks.get(task_id)
            if entry is None:
                self._queue.task_done()
                continue

            entry.status = TaskStatus.running
            try:
                entry.result = await entry.coro
                entry.status = TaskStatus.completed
            except Exception as exc:  # noqa: BLE001
                entry.error = str(exc)
                entry.status = TaskStatus.failed
            finally:
                self._queue.task_done()

    async def submit(self, coro: Coroutine[Any, Any, Any]) -> str:
        """Enqueue a coroutine and return its task_id."""
        task_id = uuid.uuid4().hex
        self._tasks[task_id] = _TaskEntry(coro)
        self._ensure_worker()
        await self._queue.put(task_id)
        return task_id

    def get_status(self, task_id: str) -> TaskStatus | None:
        entry = self._tasks.get(task_id)
        return entry.status if entry else None

    def get_result(self, task_id: str) -> Any:
        entry = self._tasks.get(task_id)
        return entry.result if entry else None

    def get_error(self, task_id: str) -> str | None:
        entry = self._tasks.get(task_id)
        return entry.error if entry else None

    async def cancel(self, task_id: str) -> bool:
        """Cancel a pending task. Running tasks cannot be cancelled."""
        entry = self._tasks.get(task_id)
        if entry is None:
            return False
        if entry.status == TaskStatus.pending:
            entry.status = TaskStatus.failed
            entry.error = "cancelled"
            return True
        return False
