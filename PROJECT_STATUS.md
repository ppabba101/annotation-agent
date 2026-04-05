# Annotation Agent — Project Status & Roadmap

## What This Is

An AI-powered tool that generates authentic, personalized handwritten notes and annotates PDFs. Given a few samples of your handwriting and a text prompt, it produces output indistinguishable from your real handwriting. Think "GoodNotes, but the AI writes for you."

**Repo:** github.com/ppabba101/annotation-agent

---

## Current State (2026-04-05)

### Phase 1: Project Scaffolding — COMPLETE

Fully working monorepo with backend and frontend scaffolded, dependencies installed, tests passing.

**Backend (Python/FastAPI):**
- FastAPI app at `backend/src/main.py` with 6 API route modules
- `GenerationPipeline` protocol at `backend/src/ml/pipeline.py` — abstract interface that both the real ML pipeline and the mock implement
- `MockPipeline` at `backend/src/ml/mock_pipeline.py` — generates placeholder images using Pillow
- In-process async task queue at `backend/src/workers/task_queue.py` (asyncio, no Celery/Redis)
- Services layer delegating routes → services → ML pipeline
- Security: binds to 127.0.0.1 only
- Tests: `backend/tests/test_api/test_health.py` passes

**Frontend (Electron/React/Fabric.js v6):**
- Electron app at `frontend/electron/main.ts` with IPC handlers
- React + Fabric.js v6 canvas with zoom, pan, selection at `frontend/src/components/Canvas/Canvas.tsx`
- Canvas toolbar (select, highlight, pen, circle, arrow, underline)
- Chat bar for natural language commands
- Sidebar: project panel, style panel, sample upload
- 4 Zustand stores (canvas, project, style, chat)
- API client + WebSocket client for backend communication
- TypeScript compiles with 0 errors

**To run:**
```bash
# Backend
cd backend && source .venv/bin/activate && uvicorn src.main:app --host 127.0.0.1 --port 8000

# Frontend
cd frontend && npm run dev          # Web only
cd frontend && npm run electron:dev  # Electron + web
```

### Phase 1.5: ML Research Spike — IN PROGRESS

Deep research completed on 5 handwriting synthesis approaches. Reference repos cloned in `research/` (gitignored — not part of codebase).

**Research repos (for reference only):**
```
research/
  DiffBrush/           — ICCV 2025, full-line diffusion generation (dailenson group)
  One-DM/              — ECCV 2024, one-shot style transfer (dailenson group)
  SDT/                 — CVPR 2023, stroke-based transformer (dailenson group)
  DiffusionPen/        — ECCV 2024, 5-shot diffusion, HuggingFace weights
  handwriting-synthesis/ — Graves RNN baseline (2013), TensorFlow
```

**Key research finding:** All top models accept image-based style references (scanned/photographed handwriting). No tablet required.

**Recommended approach: DiffusionPen (primary)**
- Pretrained weights on HuggingFace (huggingface.co/konnik/DiffusionPen)
- 5 handwriting sample images → personalized style
- Paragraph-level generation
- Single GPU inference (unlike DiffBrush which needs 4)
- Modern PyTorch, CANINE tokenizer for text conditioning
- Upgrade path to DiffBrush (same research lineage) for better quality later

**Full research report:** `.omc/research/phase-1.5-ml-research.md`

---

## What Needs to Happen Next

### Immediate: Finish Phase 1.5 (ML Evaluation)

**Goal:** Run DiffusionPen with pretrained weights, generate test output, evaluate quality.

**Steps:**
1. Set up cloud GPU environment (see Cloud GPU Setup below)
2. Download DiffusionPen pretrained weights from HuggingFace
3. Download Stable Diffusion v1.5 VAE (required by DiffusionPen)
4. Run inference with test text + IAM dataset style references
5. Evaluate: OCR accuracy, visual quality, style consistency
6. Go/no-go decision based on results

**Go/No-Go Criteria:**
| Metric | Go | No-Go |
|--------|-----|-------|
| OCR character accuracy | >=90% | <90% |
| Human readability | 2+ people say "clearly legible" | Struggle to read |
| Generation speed | <60s per page | >120s with no optimization path |

**If Go:** Proceed to Phase 2a — build the real generation pipeline using DiffusionPen
**If No-Go:** Evaluate DiffBrush (requires multi-GPU) or pivot to hybrid stroke + style transfer

### Phase 2a: Generation Pipeline Implementation (7-10 days after go/no-go)

1. Implement real `GenerationPipeline` using DiffusionPen (replacing MockPipeline)
2. Build sample upload + preprocessing pipeline
3. Build style encoder (extract style embedding from user's handwriting samples)
4. Fine-tuning pipeline (adapt model to user's specific style)
5. Layout engine (compose lines into full pages with natural variation)
6. Wire into existing FastAPI endpoints

### Phase 3: Canvas UI & PDF Rendering (5-7 days)

1. PDF loading via PDF.js rendered as canvas background
2. Generated handwriting displayed as Fabric.js objects
3. Object manipulation (select, move, resize, delete)
4. Undo/redo system
5. Project file save/load (.hwproj format — ZIP with canvas JSON + assets)
6. PDF and PNG export

### Phase 4: Annotation Tools (5-7 days)

1. Highlighter tool (semi-transparent overlay with realistic edges)
2. Pen annotations in user's handwriting style
3. Hand-drawn primitives (circles, arrows, underlines with natural wobble)
4. All annotations as moveable Fabric.js objects

### Phase 5: Natural Language Editing (3-5 days)

1. Chat bar interprets NL commands via Claude API
2. Instant commands (move, resize, delete) via regex — <1s
3. Regeneration commands (change text, restyle) — 3-60s with progress UI
4. Context: sends canvas object summary to LLM

### Phase 6: Integration & Polish (3-5 days)

1. First-run onboarding wizard
2. Progress indicators for training/generation
3. Error handling and loading states
4. Electron packaging for macOS/Windows
5. End-to-end acceptance testing

---

## Architecture Overview

```
Electron Desktop App
  React UI (Sidebar | Fabric.js Canvas | Chat Bar)
       |  HTTP/WebSocket  |
  FastAPI Backend (127.0.0.1:8000)
    /api/samples    — upload handwriting samples
    /api/train      — trigger style fine-tuning
    /api/generate   — generate handwritten text
    /api/annotate   — generate annotations
    /api/nlcommand  — NL → edit commands (via Claude API)
    /ws/progress    — real-time job status
       |
  Cloud GPU (Modal/RunPod/Lambda)
    — Model inference & fine-tuning
```

**Key abstraction:** `GenerationPipeline` protocol (`backend/src/ml/pipeline.py`)
- `generate_page(request)` → yields progress, returns page image
- `regenerate_line(request, line_index, new_text)` → returns single line
- `is_ready()` / `cancel(task_id)`
- Currently implemented by `MockPipeline`; will be replaced by real DiffusionPen pipeline

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/main.py` | FastAPI app entry point |
| `backend/src/ml/pipeline.py` | GenerationPipeline protocol (the core abstraction) |
| `backend/src/ml/mock_pipeline.py` | Placeholder implementation |
| `backend/src/workers/task_queue.py` | Async task queue |
| `backend/src/config.py` | Backend configuration |
| `frontend/src/App.tsx` | Main React layout |
| `frontend/src/components/Canvas/Canvas.tsx` | Fabric.js canvas |
| `frontend/src/components/Chat/ChatBar.tsx` | NL command input |
| `frontend/src/stores/canvasStore.ts` | Canvas state (Zustand) |
| `frontend/src/services/api.ts` | Backend API client |
| `.omc/plans/annotation-agent-v1.md` | Full consensus-approved implementation plan |
| `.omc/specs/deep-interview-annotation-agent.md` | Requirements spec from deep interview |
| `.omc/research/phase-1.5-ml-research.md` | ML research findings |

---

## Acceptance Criteria (MVP v1)

- [ ] Upload 5+ pages of handwriting → system creates personalized style
- [ ] Generate full page from text prompt in user's style (<60s)
- [ ] "Roommate test" — fools people who know the writer's handwriting
- [ ] Open PDF, highlight text regions with realistic highlighter marks
- [ ] Add pen annotations in personal handwriting style
- [ ] Canvas UI: select, move, resize, delete elements
- [ ] Chat bar accepts NL editing commands
- [ ] Save as editable project file, export to PDF/PNG

## What's NOT in v1 (deferred to v2+)

- Sticky notes, math equations, image drawing
- Autonomous PDF processing (auto-annotate chapters)
- Real-time co-creation mode
- Mobile app
- Web version (desktop-first, web later)

---

## Cloud GPU Setup Guide

See the "Cloud GPU Setup" section at the bottom of this document for a walkthrough.

### Option 1: Modal (Recommended for Development)

**Why Modal:**
- Pay-per-second billing (no idle charges)
- Serverless — no VM management
- Great Python SDK (define GPU functions as decorators)
- Free $30/month credits for new accounts
- Easy to switch between GPU types (T4, A10G, A100, H100)

**Setup:**
```bash
# 1. Install Modal
pip install modal

# 2. Create account and authenticate
modal setup
# This opens a browser — sign up at modal.com, authenticate

# 3. Test it works
modal run hello_world.py
```

**Estimated costs:**
- A10G (24GB VRAM): ~$0.60/hr — good for inference
- A100 (40GB VRAM): ~$2.78/hr — good for fine-tuning
- Training run (~10 min): ~$0.50
- Per-page generation (~30s): ~$0.01

### Option 2: RunPod (Good Alternative)

**Why RunPod:**
- Simple VM-based GPU rental
- Community cloud (cheaper) and secure cloud options
- Persistent storage between sessions
- Jupyter notebook interface

**Setup:**
1. Go to runpod.io, create account
2. Add payment method
3. Deploy a GPU pod (select A10G or A100)
4. SSH in or use Jupyter
5. Clone repo, install deps, run

**Estimated costs:**
- A10G: ~$0.44/hr (community cloud)
- A100 40GB: ~$1.64/hr (community cloud)

### Option 3: Lambda Labs

**Why Lambda:**
- Simple, developer-friendly
- Good for longer sessions
- Pre-installed ML stack (PyTorch, CUDA)

**Setup:**
1. Go to lambdalabs.com/cloud
2. Create account, add payment
3. Launch an instance (A10 or A100)
4. SSH in, clone repo, run

### Recommendation

**For this project, I recommend Modal** because:
1. You only pay when code is running (no idle VM charges)
2. The Python SDK lets us define GPU inference as a function call from our FastAPI backend
3. Easy to prototype: change `@modal.function(gpu="A10G")` to `gpu="A100"` to switch
4. Free credits to start
5. When we build the production pipeline, Modal functions integrate directly into our backend

**To get started:**
```bash
pip install modal
modal setup
```

Then authenticate in the browser. That's it — I can write the GPU inference code that uses Modal once you have it set up.
