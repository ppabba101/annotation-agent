export interface PageInfo {
  id: string;
  index: number;
  label: string;
  pdfPageNum: number | null;
  thumbnailUrl: string | null;
  canvasJson: string | null;
}

export interface SampleInfo {
  id: string;
  filename: string;
  url: string;
  uploadedAt: string;
  status: 'pending' | 'uploaded' | 'error';
}

export interface ProjectFile {
  version: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: PageInfo[];
  styleId: string | null;
}
