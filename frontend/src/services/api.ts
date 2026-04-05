import type {
  UploadSampleRequest,
  UploadSampleResponse,
  StartTrainingRequest,
  StartTrainingResponse,
  GenerateRequest,
  GenerateResponse,
  AnnotateRequest,
  AnnotateResponse,
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
  uploadSample: async (req: UploadSampleRequest): Promise<UploadSampleResponse> => {
    const form = new FormData();
    form.append('file', req.file);
    if (req.styleId) form.append('style_id', req.styleId);

    const res = await fetch(`${BASE_URL}/samples/upload`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const body = await res.json() as { detail?: string };
      throw new ApiClientError({ detail: body.detail ?? res.statusText, status: res.status });
    }
    return res.json() as Promise<UploadSampleResponse>;
  },

  startTraining: (req: StartTrainingRequest): Promise<StartTrainingResponse> =>
    request<StartTrainingResponse>('/training/start', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  generate: (req: GenerateRequest): Promise<GenerateResponse> =>
    request<GenerateResponse>('/generate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  annotate: (req: AnnotateRequest): Promise<AnnotateResponse> =>
    request<AnnotateResponse>('/annotate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  sendNLCommand: (req: NLCommandRequest): Promise<NLCommandResponse> =>
    request<NLCommandResponse>('/command', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  healthCheck: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),
};
