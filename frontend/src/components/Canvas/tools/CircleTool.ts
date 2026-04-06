import { Path, Ellipse } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';
import { wobbleEllipse } from '@/lib/wobble';
import { useCanvasStore } from '@/stores/canvasStore';

export class CircleTool implements ToolHandler {
  name = 'circle';
  cursor = 'crosshair';
  private startPoint: ToolPointer | null = null;
  private preview: Ellipse | null = null;

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

    if (this.preview) {
      canvas.remove(this.preview);
    }

    const x1 = Math.min(this.startPoint.x, pointer.x);
    const y1 = Math.min(this.startPoint.y, pointer.y);
    const x2 = Math.max(this.startPoint.x, pointer.x);
    const y2 = Math.max(this.startPoint.y, pointer.y);

    const rx = (x2 - x1) / 2;
    const ry = (y2 - y1) / 2;

    this.preview = new Ellipse({
      left: x1,
      top: y1,
      rx,
      ry,
      stroke: '#e53e3e',
      strokeWidth: 1,
      strokeDashArray: [4, 4],
      fill: 'transparent',
      selectable: false,
      evented: false,
    });

    canvas.add(this.preview);
    canvas.requestRenderAll();
  }

  onMouseUp(canvas: FabricCanvas, pointer: ToolPointer, _e: MouseEvent): void {
    if (!this.startPoint) return;

    const x1 = Math.min(this.startPoint.x, pointer.x);
    const y1 = Math.min(this.startPoint.y, pointer.y);
    const x2 = Math.max(this.startPoint.x, pointer.x);
    const y2 = Math.max(this.startPoint.y, pointer.y);

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = (x2 - x1) / 2;
    const ry = (y2 - y1) / 2;

    this.cleanup(canvas);

    if (rx < 5 || ry < 5) return;

    const pathData = wobbleEllipse(cx, cy, rx, ry);
    const path = new Path(pathData, {
      stroke: '#e53e3e',
      strokeWidth: 2,
      fill: 'transparent',
      selectable: true,
      name: 'annotation-circle',
    });

    canvas.add(path);
    canvas.requestRenderAll();
  }

  private cleanup(canvas: FabricCanvas): void {
    if (this.preview) {
      canvas.remove(this.preview);
      this.preview = null;
    }
    this.startPoint = null;
  }
}
