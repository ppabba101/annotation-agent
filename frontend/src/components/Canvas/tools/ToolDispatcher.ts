import type { Canvas as FabricCanvas } from 'fabric';
import { Point } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';
import type { ToolType } from '@/types/canvas';
import { SelectTool } from './SelectTool';
import { CircleTool } from './CircleTool';
import { ArrowTool } from './ArrowTool';
import { UnderlineTool } from './UnderlineTool';
import { HighlightTool } from './HighlightTool';

export class ToolDispatcher {
  private handlers: Map<string, ToolHandler> = new Map();
  private activeHandler: ToolHandler | null = null;
  private spaceDown = false;
  private selectTool = new SelectTool();

  constructor() {
    this.registerTool(this.selectTool);
    this.registerTool(new CircleTool());
    this.registerTool(new ArrowTool());
    this.registerTool(new UnderlineTool());
    this.registerTool(new HighlightTool());
  }

  registerTool(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);
  }

  setActiveTool(canvas: FabricCanvas, toolName: ToolType): void {
    if (this.activeHandler) {
      this.activeHandler.onDeactivate(canvas);
    }
    this.activeHandler = this.handlers.get(toolName) ?? this.selectTool;
    this.activeHandler.onActivate(canvas);
    canvas.setCursor(this.activeHandler.cursor);
  }

  private getPointer(canvas: FabricCanvas, e: MouseEvent): ToolPointer {
    // Fabric v6: use getScenePoint if available, otherwise compute manually
    if (typeof canvas.getScenePoint === 'function') {
      const pt = canvas.getScenePoint(e);
      return { x: pt.x, y: pt.y };
    }
    // Fallback: compute from viewportTransform
    const vpt = canvas.viewportTransform;
    if (!vpt) return { x: e.offsetX, y: e.offsetY };
    const point = new Point(e.offsetX, e.offsetY);
    const inverted = point.transform(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).invertTransform(vpt)
    );
    return { x: inverted.x, y: inverted.y };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMouseDown(canvas: FabricCanvas, e: MouseEvent, target?: any): void {
    const pointer = this.getPointer(canvas, e);
    if (this.spaceDown) {
      this.selectTool.onMouseDown(canvas, pointer, e);
      return;
    }
    // If user clicked on a selectable object, let Fabric handle selection/dragging
    // Don't fire the drawing tool on existing objects
    if (target && target.selectable) {
      return;
    }
    this.activeHandler?.onMouseDown(canvas, pointer, e);
  }

  onMouseMove(canvas: FabricCanvas, e: MouseEvent): void {
    const pointer = this.getPointer(canvas, e);
    if (this.spaceDown) {
      this.selectTool.onMouseMove(canvas, pointer, e);
      return;
    }
    this.activeHandler?.onMouseMove(canvas, pointer, e);
  }

  onMouseUp(canvas: FabricCanvas, e: MouseEvent): void {
    const pointer = this.getPointer(canvas, e);
    if (this.spaceDown) {
      this.selectTool.onMouseUp(canvas, pointer, e);
      return;
    }
    this.activeHandler?.onMouseUp(canvas, pointer, e);
  }

  onKeyDown(e: KeyboardEvent, canvas: FabricCanvas): void {
    // Don't intercept keypresses in text inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.code === 'Space') {
      this.spaceDown = true;
      canvas.setCursor('grab');
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = canvas.getActiveObjects();
      if (active.length > 0) {
        active.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
  }

  onKeyUp(e: KeyboardEvent, canvas: FabricCanvas): void {
    if (e.code === 'Space') {
      this.spaceDown = false;
      canvas.setCursor(this.activeHandler?.cursor ?? 'default');
    }
  }
}
