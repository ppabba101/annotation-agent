// ── Request types ──────────────────────────────────────────────────────────────

export interface GenerateRequest {
  text: string;
  style_index?: number;  // 0-12, default 0
  bias?: number;         // 0.0-1.0, default 0.5
}

export interface NLCommandRequest {
  command: string;
  context: {
    pageId: string;
    activeTool: string;
    canvasJson?: string;
  };
}

// ── Response types ─────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status: number;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface StrokeLine {
  d: string;
  bbox: { x: number; y: number; width: number; height: number };
  text_content: string;
}

export interface StrokeResult {
  lines: StrokeLine[];
  total_width: number;
  total_height: number;
}

export interface GenerateResponse {
  task_id: string;
  status: string;
}

export interface NLCommandResponse {
  interpretation: string;
  actions: CommandAction[];
  status: 'ok' | 'error';
}

export interface CommandAction {
  type: string;
  payload: Record<string, unknown>;
}

// ── WebSocket progress types ───────────────────────────────────────────────────

export type ProgressStatus = 'queued' | 'processing' | 'complete' | 'error';

export interface ProgressEvent {
  taskId: string;
  status: ProgressStatus;
  progress: number;
  message?: string;
  result?: unknown;
}
