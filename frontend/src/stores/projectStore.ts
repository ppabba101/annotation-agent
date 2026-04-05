import { create } from 'zustand';
import type { PageInfo } from '@/types/project';

interface ProjectState {
  projectName: string;
  projectPath: string | null;
  pages: PageInfo[];
  currentPageIndex: number;
  isDirty: boolean;
  setProject: (name: string, path: string) => void;
  addPage: () => void;
  deletePage: (index: number) => void;
  setCurrentPage: (index: number) => void;
  markDirty: () => void;
  markClean: () => void;
}

function createPage(index: number): PageInfo {
  return {
    id: crypto.randomUUID(),
    index,
    label: `Page ${index + 1}`,
    pdfPageNum: null,
    thumbnailUrl: null,
    canvasJson: null,
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectName: 'Untitled Project',
  projectPath: null,
  pages: [createPage(0)],
  currentPageIndex: 0,
  isDirty: false,

  setProject: (name, path) =>
    set({ projectName: name, projectPath: path, isDirty: false }),

  addPage: () => {
    const { pages } = get();
    const newPage = createPage(pages.length);
    set({ pages: [...pages, newPage], isDirty: true });
  },

  deletePage: (index) => {
    const { pages, currentPageIndex } = get();
    if (pages.length <= 1) return;
    const updated = pages.filter((_, i) => i !== index).map((p, i) => ({
      ...p,
      index: i,
      label: `Page ${i + 1}`,
    }));
    const newCurrent = Math.min(currentPageIndex, updated.length - 1);
    set({ pages: updated, currentPageIndex: newCurrent, isDirty: true });
  },

  setCurrentPage: (index) => set({ currentPageIndex: index }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),
}));
