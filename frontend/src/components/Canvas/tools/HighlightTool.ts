import { Path, Rect } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';
import { highlightPath } from '@/lib/wobble';
import { useCanvasStore } from '@/stores/canvasStore';

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.3)',
  green: 'rgba(76, 175, 80, 0.3)',
  pink: 'rgba(233, 30, 99, 0.3)',
  blue: 'rgba(33, 150, 243, 0.3)',
};

export { HIGHLIGHT_COLORS };

export class HighlightTool implements ToolHandler {
  name = 'highlight';
  cursor = 'text';
  private startPoint: ToolPointer | null = null;
  private previewRect: Rect | null = null;

  private get color(): string {
    return useCanvasStore.getState().highlightColor;
  }

  onActivate(_canvas: FabricCanvas): void {
    _canvas.selection = false;
  }

  onDeactivate(_canvas: FabricCanvas): void {
    this.cleanup(_canvas);
  }

  onMouseDown(_canvas: FabricCanvas, pointer: ToolPointer, e: MouseEvent): void {
    if (e.button !== 0) return;
    useCanvasStore.getState().pushUndo();
    this.startPoint = { x: pointer.x, y: pointer.y };
  }

  onMouseMove(canvas: FabricCanvas, pointer: ToolPointer, _e: MouseEvent): void {
    if (!this.startPoint) return;

    if (this.previewRect) {
      canvas.remove(this.previewRect);
    }

    const x = Math.min(this.startPoint.x, pointer.x);
    const y = Math.min(this.startPoint.y, pointer.y);
    const w = Math.abs(pointer.x - this.startPoint.x);
    const h = Math.abs(pointer.y - this.startPoint.y);

    this.previewRect = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: this.color,
      stroke: 'transparent',
      strokeWidth: 0,
      selectable: false,
      evented: false,
    });

    canvas.add(this.previewRect);
    canvas.requestRenderAll();
  }

  onMouseUp(canvas: FabricCanvas, pointer: ToolPointer, _e: MouseEvent): void {
    if (!this.startPoint) return;

    const x = Math.min(this.startPoint.x, pointer.x);
    const y = Math.min(this.startPoint.y, pointer.y);
    const w = Math.abs(pointer.x - this.startPoint.x);
    const h = Math.abs(pointer.y - this.startPoint.y);

    this.cleanup(canvas);

    if (w < 10 || h < 5) return;

    const pathData = highlightPath(x, y, w, h);
    const path = new Path(pathData, {
      fill: this.color,
      stroke: 'transparent',
      strokeWidth: 0,
      selectable: true,
      opacity: 1,
      name: 'annotation-highlight',
    });

    canvas.add(path);
    canvas.requestRenderAll();
  }

  private cleanup(canvas: FabricCanvas): void {
    if (this.previewRect) {
      canvas.remove(this.previewRect);
      this.previewRect = null;
    }
    this.startPoint = null;
  }
}
