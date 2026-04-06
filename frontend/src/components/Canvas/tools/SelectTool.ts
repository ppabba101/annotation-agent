import type { Canvas as FabricCanvas } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';

export class SelectTool implements ToolHandler {
  name = 'select';
  cursor = 'default';
  private isPanning = false;
  private lastPos = { x: 0, y: 0 };

  onActivate(canvas: FabricCanvas): void {
    canvas.selection = true;
  }

  onDeactivate(canvas: FabricCanvas): void {
    canvas.selection = false;
  }

  onMouseDown(canvas: FabricCanvas, _pointer: ToolPointer, e: MouseEvent): void {
    if (e.button === 1) {
      this.isPanning = true;
      this.lastPos = { x: e.clientX, y: e.clientY };
      canvas.setCursor('grabbing');
      e.preventDefault();
    }
  }

  onMouseMove(canvas: FabricCanvas, _pointer: ToolPointer, e: MouseEvent): void {
    if (!this.isPanning) return;
    const vpt = canvas.viewportTransform;
    if (!vpt) return;
    vpt[4] += e.clientX - this.lastPos.x;
    vpt[5] += e.clientY - this.lastPos.y;
    canvas.requestRenderAll();
    this.lastPos = { x: e.clientX, y: e.clientY };
  }

  onMouseUp(canvas: FabricCanvas, _pointer: ToolPointer, _e: MouseEvent): void {
    this.isPanning = false;
    canvas.setCursor(this.cursor);
  }
}
