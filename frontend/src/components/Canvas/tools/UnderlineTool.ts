import { Path, Line } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';
import { wobbleLine } from '@/lib/wobble';
import { useCanvasStore } from '@/stores/canvasStore';

export class UnderlineTool implements ToolHandler {
  name = 'underline';
  cursor = 'text';
  private startPoint: ToolPointer | null = null;
  private previewLine: Line | null = null;

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

    if (this.previewLine) {
      canvas.remove(this.previewLine);
    }

    this.previewLine = new Line(
      [this.startPoint.x, this.startPoint.y, pointer.x, this.startPoint.y],
      {
        stroke: '#e53e3e',
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
      },
    );

    canvas.add(this.previewLine);
    canvas.requestRenderAll();
  }

  onMouseUp(canvas: FabricCanvas, pointer: ToolPointer, _e: MouseEvent): void {
    if (!this.startPoint) return;

    const x1 = Math.min(this.startPoint.x, pointer.x);
    const x2 = Math.max(this.startPoint.x, pointer.x);
    const y = this.startPoint.y;

    this.cleanup(canvas);

    if (x2 - x1 < 10) return;

    const pathData = wobbleLine(x1, y, x2, y);
    const path = new Path(pathData, {
      stroke: '#e53e3e',
      strokeWidth: 2,
      fill: 'transparent',
      selectable: true,
      name: 'annotation-underline',
    });

    canvas.add(path);
    canvas.requestRenderAll();
  }

  private cleanup(canvas: FabricCanvas): void {
    if (this.previewLine) {
      canvas.remove(this.previewLine);
      this.previewLine = null;
    }
    this.startPoint = null;
  }
}
