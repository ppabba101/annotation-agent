import { Path, Line } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';
import { wobbleArrow } from '@/lib/wobble';
import { useCanvasStore } from '@/stores/canvasStore';

export class ArrowTool implements ToolHandler {
  name = 'arrow';
  cursor = 'crosshair';
  private startPoint: ToolPointer | null = null;
  private previewLine: Line | null = null;

  onActivate(canvas: FabricCanvas): void {
    canvas.selection = false;
  }

  onDeactivate(canvas: FabricCanvas): void {
    this.cleanup(canvas);
  }

  onMouseDown(canvas: FabricCanvas, pointer: ToolPointer, e: MouseEvent): void {
    if (e.button !== 0) return;

    if (!this.startPoint) {
      // First click: record start
      this.startPoint = { x: pointer.x, y: pointer.y };
    } else {
      // Second click: generate arrow
      const dx = pointer.x - this.startPoint.x;
      const dy = pointer.y - this.startPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 10) {
        this.cleanup(canvas);
        return;
      }

      useCanvasStore.getState().pushUndo();
      const pathData = wobbleArrow(
        this.startPoint.x,
        this.startPoint.y,
        pointer.x,
        pointer.y,
      );
      const path = new Path(pathData, {
        stroke: '#e53e3e',
        strokeWidth: 2,
        fill: 'transparent',
        selectable: true,
        name: 'annotation-arrow',
      });

      this.cleanup(canvas);
      canvas.add(path);
      canvas.requestRenderAll();
    }
  }

  onMouseMove(canvas: FabricCanvas, pointer: ToolPointer, _e: MouseEvent): void {
    if (!this.startPoint) return;

    if (this.previewLine) {
      canvas.remove(this.previewLine);
    }

    this.previewLine = new Line(
      [this.startPoint.x, this.startPoint.y, pointer.x, pointer.y],
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

  onMouseUp(_canvas: FabricCanvas, _pointer: ToolPointer, _e: MouseEvent): void {
    // Two-click interaction: nothing on mouse up
  }

  private cleanup(canvas: FabricCanvas): void {
    if (this.previewLine) {
      canvas.remove(this.previewLine);
      this.previewLine = null;
    }
    this.startPoint = null;
  }
}
