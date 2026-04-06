import type {
  TaskStatus,
  GenerateRequest,
  GenerateResponse,
  StrokeResult,
  NLCommandRequest,
  NLCommandResponse,
  ApiError,
} from '@/types/api';

const BASE_URL = 'http://localhost:8000';

class ApiClientError extends Error {
  status: number;
  detail: string;

  constructor(error: ApiError) {
    super(error.detail);
    this.name = 'ApiClientError';
    this.status = error.status;
    this.detail = error.detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json() as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiClientError({ detail, status: res.status });
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  healthCheck: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),

  // Handwriting generation (stroke-based)
  generate: (req: GenerateRequest): Promise<GenerateResponse> =>
    request<GenerateResponse>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  getTaskStatus: (taskId: string): Promise<TaskStatus> =>
    request<TaskStatus>(`/api/generate/${taskId}/status`),

  getTaskResult: (taskId: string): Promise<StrokeResult> =>
    request<StrokeResult>(`/api/generate/${taskId}/result`),

  // Annotation endpoints
  uploadPdf: async (file: File): Promise<{ pdf_path: string; pdf_id: string; filename: string }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/api/annotate/upload-pdf`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new ApiClientError({ detail: res.statusText, status: res.status });
    return res.json();
  },

  annotateAutonomous: async (params: {
    pdf_path: string;
    start_page?: number;
    end_page?: number;
    canvas_width?: number;
    canvas_height?: number;
    context?: string;
    style_index?: number;
  }): Promise<{ task_id: string; status: string }> => {
    const form = new FormData();
    form.append('pdf_path', params.pdf_path);
    if (params.start_page) form.append('start_page', String(params.start_page));
    if (params.end_page) form.append('end_page', String(params.end_page));
    if (params.canvas_width) form.append('canvas_width', String(params.canvas_width));
    if (params.canvas_height) form.append('canvas_height', String(params.canvas_height));
    if (params.context) form.append('context', params.context);
    if (params.style_index != null) form.append('style_index', String(params.style_index));
    const res = await fetch(`${BASE_URL}/api/annotate/autonomous`, { method: 'POST', body: form });
    if (!res.ok) throw new ApiClientError({ detail: res.statusText, status: res.status });
    return res.json();
  },

  annotatePrompt: async (params: {
    pdf_path: string;
    page_num?: number;
    command?: string;
    canvas_width?: number;
    canvas_height?: number;
    style_index?: number;
  }): Promise<{ task_id: string; status: string }> =>
    request<{ task_id: string; status: string }>('/api/annotate/prompt', {
      method: 'POST',
      body: JSON.stringify({
        pdf_path: params.pdf_path,
        page_num: params.page_num ?? 1,
        command: params.command ?? '',
        canvas_width: params.canvas_width ?? 1000,
        canvas_height: params.canvas_height ?? 1000,
        style_index: params.style_index ?? 0,
      }),
    }),

  getAnnotationStatus: (taskId: string): Promise<TaskStatus> =>
    request<TaskStatus>(`/api/annotate/${taskId}/status`),

  getAnnotationResult: (taskId: string): Promise<Record<string, unknown>> =>
    request<Record<string, unknown>>(`/api/annotate/${taskId}/result`),

  // NL Commands
  sendNLCommand: (req: NLCommandRequest): Promise<NLCommandResponse> =>
    request<NLCommandResponse>('/api/nlcommand', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
};
