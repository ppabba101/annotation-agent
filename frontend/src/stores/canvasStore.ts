import { create } from 'zustand';
import { Canvas, FabricImage, util } from 'fabric';
import type { ToolType } from '@/types/canvas';

interface CanvasState {
  canvas: Canvas | null;
  activeTool: ToolType;
  zoom: number;
  pdfRenderScale: number;
  bgImageScale: number;
  highlightColor: string;
  undoStack: string[];
  redoStack: string[];
  pdfFile: File | null;
  pdfCurrentPage: number;
  pdfTotalPages: number;
  // Page-level annotation storage: pageNum → serialized objects JSON
  pageAnnotations: Record<number, string>;
  setCanvas: (canvas: Canvas) => void;
  setActiveTool: (tool: ToolType) => void;
  setZoom: (zoom: number) => void;
  setPdfScales: (renderScale: number, bgScale: number) => void;
  setHighlightColor: (color: string) => void;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  loadImage: (url: string) => void;
  setPdfFile: (file: File | null, totalPages: number) => void;
  setPdfCurrentPage: (page: number) => void;
  // Page annotation methods
  saveCurrentPageAnnotations: () => void;
  loadPageAnnotations: (page: number) => void;
  navigatePage: (delta: number) => Promise<void>;
}

/**
 * Serialize canvas objects ONLY (exclude backgroundImage).
 * Returns a JSON string of the objects array.
 */
function serializeObjects(canvas: Canvas): string {
  const bg = canvas.backgroundImage;
  const objects = canvas.getObjects().filter((obj) => obj !== bg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.stringify(objects.map((obj) => (obj as any).toObject()));
}

/**
 * Deserialize objects and add them to the canvas (preserving background).
 */
async function deserializeObjects(canvas: Canvas, json: string): Promise<void> {
  if (!json || json === '[]') return;
  const parsed = JSON.parse(json) as object[];
  if (parsed.length === 0) return;

  return new Promise<void>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    util.enlivenObjects(parsed).then((objects: any[]) => {
      for (const obj of objects) {
        canvas.add(obj);
      }
      canvas.requestRenderAll();
      resolve();
    });
  });
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  activeTool: 'select',
  zoom: 1,
  pdfRenderScale: 1.5,
  bgImageScale: 1,
  highlightColor: 'rgba(255, 235, 59, 0.3)',
  undoStack: [],
  redoStack: [],
  pdfFile: null,
  pdfCurrentPage: 1,
  pdfTotalPages: 0,
  pageAnnotations: {},

  setCanvas: (canvas) => set({ canvas }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setZoom: (zoom) => set({ zoom }),
  setPdfScales: (renderScale, bgScale) =>
    set({ pdfRenderScale: renderScale, bgImageScale: bgScale }),
  setHighlightColor: (color) => set({ highlightColor: color }),

  // Undo/redo: serialize OBJECTS ONLY (no background)
  pushUndo: () => {
    const { canvas, undoStack } = get();
    if (!canvas) return;
    const snapshot = serializeObjects(canvas);
    set({ undoStack: [...undoStack, snapshot], redoStack: [] });
  },

  undo: () => {
    const { canvas, undoStack, redoStack } = get();
    if (!canvas || undoStack.length === 0) return;
    const current = serializeObjects(canvas);
    const prev = undoStack[undoStack.length - 1];

    // Clear objects only (preserve background)
    const bg = canvas.backgroundImage;
    canvas.getObjects().forEach((obj) => {
      if (obj !== bg) canvas.remove(obj);
    });

    // Restore previous state
    deserializeObjects(canvas, prev);

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
    });
  },

  redo: () => {
    const { canvas, undoStack, redoStack } = get();
    if (!canvas || redoStack.length === 0) return;
    const current = serializeObjects(canvas);
    const next = redoStack[redoStack.length - 1];

    const bg = canvas.backgroundImage;
    canvas.getObjects().forEach((obj) => {
      if (obj !== bg) canvas.remove(obj);
    });

    deserializeObjects(canvas, next);

    set({
      undoStack: [...undoStack, current],
      redoStack: redoStack.slice(0, -1),
    });
  },

  setPdfFile: (file, totalPages) =>
    set({ pdfFile: file, pdfTotalPages: totalPages, pdfCurrentPage: 1, pageAnnotations: {} }),

  setPdfCurrentPage: (page) => set({ pdfCurrentPage: page }),

  // Save current page's annotations (objects only, no background)
  saveCurrentPageAnnotations: () => {
    const { canvas, pdfCurrentPage, pageAnnotations } = get();
    if (!canvas) return;
    const json = serializeObjects(canvas);
    set({ pageAnnotations: { ...pageAnnotations, [pdfCurrentPage]: json } });
  },

  // Load a page's annotations onto the canvas (clearing existing objects first)
  loadPageAnnotations: (page: number) => {
    const { canvas, pageAnnotations } = get();
    if (!canvas) return;

    // Clear existing objects (preserve background)
    const bg = canvas.backgroundImage;
    canvas.getObjects().forEach((obj) => {
      if (obj !== bg) canvas.remove(obj);
    });

    // Load target page's annotations
    const json = pageAnnotations[page];
    if (json) {
      deserializeObjects(canvas, json);
    }

    canvas.requestRenderAll();
  },

  // Shared navigation: save current → load PDF page → load annotations
  navigatePage: async (delta: number) => {
    const { pdfFile, pdfCurrentPage, pdfTotalPages, canvas } = get();
    if (!pdfFile || !canvas) return;

    const newPage = pdfCurrentPage + delta;
    if (newPage < 1 || newPage > pdfTotalPages) return;

    // 1. Save current page's annotations
    get().saveCurrentPageAnnotations();

    // 2. Load new PDF page as background
    const { loadPDF } = await import('@/components/Canvas/PDFLayer');
    await loadPDF(pdfFile, newPage, canvas);

    // 3. Load new page's annotations
    get().loadPageAnnotations(newPage);

    // 4. Clear undo/redo stacks (they're page-specific)
    set({ pdfCurrentPage: newPage, undoStack: [], redoStack: [] });
  },

  loadImage: (url: string) => {
    const { canvas } = get();
    if (!canvas) return;

    const objects = canvas.getObjects();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placeholder = objects.find((obj: any) => obj.name === '__placeholder__');
    if (placeholder) canvas.remove(placeholder);

    FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
      if (!img || !img.width || !img.height) return;

      const cw = canvas.getWidth();
      const ch = canvas.getHeight();
      const pad = 40;
      const scale = Math.min((cw - pad * 2) / img.width, (ch - pad * 2) / img.height, 1);

      img.set({
        scaleX: scale, scaleY: scale,
        left: cw / 2, top: ch / 2,
        originX: 'center', originY: 'center',
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    }).catch((err) => {
      console.error('Failed to load image:', url, err);
    });
  },
}));
