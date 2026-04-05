// ── Request types ──────────────────────────────────────────────────────────────

export interface UploadSampleRequest {
  file: File;
  styleId?: string;
}

export interface StartTrainingRequest {
  styleId: string;
  sampleIds: string[];
}

export interface GenerateRequest {
  text: string;
  styleId: string;
  pageId: string;
  position: { x: number; y: number };
  fontSize?: number;
}

export interface AnnotateRequest {
  command: string;
  pageId: string;
  canvasJson: string;
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

export interface UploadSampleResponse {
  sampleId: string;
  styleId: string;
  filename: string;
  status: 'uploaded';
}

export interface StartTrainingResponse {
  taskId: string;
  styleId: string;
  status: 'queued' | 'training';
}

export interface GenerateResponse {
  taskId: string;
  status: 'queued' | 'processing';
  resultUrl?: string;
}

export interface AnnotateResponse {
  taskId: string;
  status: 'queued' | 'processing';
  patches?: CanvasPatch[];
}

export interface NLCommandResponse {
  interpretation: string;
  actions: CommandAction[];
  status: 'ok' | 'error';
}

export interface CanvasPatch {
  type: 'add' | 'remove' | 'modify';
  objectId?: string;
  fabricData?: string;
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
  progress: number; // 0–100
  message?: string;
  result?: unknown;
}
