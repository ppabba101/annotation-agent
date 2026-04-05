import { create } from 'zustand';
import { Canvas, FabricImage } from 'fabric';
import type { ToolType } from '@/types/canvas';

interface CanvasState {
  canvas: Canvas | null;
  activeTool: ToolType;
  zoom: number;
  undoStack: string[];
  redoStack: string[];
  setCanvas: (canvas: Canvas) => void;
  setActiveTool: (tool: ToolType) => void;
  setZoom: (zoom: number) => void;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  loadImage: (url: string) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  activeTool: 'select',
  zoom: 1,
  undoStack: [],
  redoStack: [],

  setCanvas: (canvas) => set({ canvas }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setZoom: (zoom) => set({ zoom }),

  pushUndo: () => {
    const { canvas, undoStack } = get();
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    set({ undoStack: [...undoStack, json], redoStack: [] });
  },

  undo: () => {
    const { canvas, undoStack, redoStack } = get();
    if (!canvas || undoStack.length === 0) return;
    const current = JSON.stringify(canvas.toJSON());
    const prev = undoStack[undoStack.length - 1];
    canvas.loadFromJSON(JSON.parse(prev), () => {
      canvas.renderAll();
    });
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
    });
  },

  redo: () => {
    const { canvas, undoStack, redoStack } = get();
    if (!canvas || redoStack.length === 0) return;
    const current = JSON.stringify(canvas.toJSON());
    const next = redoStack[redoStack.length - 1];
    canvas.loadFromJSON(JSON.parse(next), () => {
      canvas.renderAll();
    });
    set({
      undoStack: [...undoStack, current],
      redoStack: redoStack.slice(0, -1),
    });
  },

  loadImage: (url: string) => {
    const { canvas } = get();
    if (!canvas) return;

    // Remove placeholder text if present
    const objects = canvas.getObjects();
    const placeholder = objects.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj: any) => obj.name === '__placeholder__'
    );
    if (placeholder) {
      canvas.remove(placeholder);
    }

    FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
      // Scale to fit canvas width with some padding
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const padding = 40;
      const maxWidth = canvasWidth - padding * 2;
      const maxHeight = canvasHeight - padding * 2;

      const imgWidth = img.width ?? maxWidth;
      const imgHeight = img.height ?? maxHeight;
      const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

      img.set({
        scaleX: scale,
        scaleY: scale,
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        originX: 'center',
        originY: 'center',
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    });
  },
}));
