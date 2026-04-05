# Annotation Agent

AI-powered handwriting generation and PDF annotation tool. Generates authentic, personalized handwritten notes and annotations that match your handwriting style.

## Architecture

- **Backend:** Python / FastAPI — ML pipeline, PDF processing, generation API
- **Frontend:** Electron / React / Fabric.js — Canvas editor, chat interface, PDF viewer

## Development

### Backend

```bash
cd backend
uv sync
uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
annotation-agent/
  backend/           — Python backend (FastAPI + ML pipeline)
  frontend/          — Electron + React frontend
  shared/            — Shared type definitions
```
