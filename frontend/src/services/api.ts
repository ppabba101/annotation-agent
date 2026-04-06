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
      // ignore parse errors
    }
    throw new ApiClientError({ detail, status: res.status });
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  healthCheck: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),

  // Generation
  generate: (req: GenerateRequest): Promise<GenerateResponse> =>
    request<GenerateResponse>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  getTaskStatus: (taskId: string): Promise<TaskStatus> =>
    request<TaskStatus>(`/api/generate/${taskId}/status`),

  getTaskResult: (taskId: string): Promise<StrokeResult> =>
    request<StrokeResult>(`/api/generate/${taskId}/result`),

  // NL Commands
  sendNLCommand: (req: NLCommandRequest): Promise<NLCommandResponse> =>
    request<NLCommandResponse>('/api/nlcommand', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
};
