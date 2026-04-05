from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import annotation, generation, health, nlcommand, samples, training
from src.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    yield
    # Shutdown — nothing to clean up for now


app = FastAPI(
    title="Annotation Agent API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(samples.router)
app.include_router(training.router)
app.include_router(generation.router)
app.include_router(annotation.router)
app.include_router(nlcommand.router)


# WebSocket progress endpoint
_ws_clients: list[WebSocket] = []


@app.websocket("/ws/progress")
async def ws_progress(websocket: WebSocket) -> None:
    await websocket.accept()
    _ws_clients.append(websocket)
    try:
        while True:
            # Keep connection alive; clients send pings as plain text
            data = await websocket.receive_text()
            await websocket.send_text(json.dumps({"type": "pong", "data": data}))
    except WebSocketDisconnect:
        _ws_clients.remove(websocket)


async def broadcast_progress(message: dict) -> None:
    """Broadcast a progress message to all connected WebSocket clients."""
    disconnected: list[WebSocket] = []
    for ws in list(_ws_clients):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:  # noqa: BLE001
            disconnected.append(ws)
    for ws in disconnected:
        if ws in _ws_clients:
            _ws_clients.remove(ws)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
