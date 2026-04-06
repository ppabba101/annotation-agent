import type { Canvas as FabricCanvas } from 'fabric';

export interface ToolPointer {
  x: number;
  y: number;
}

export interface ToolHandler {
  name: string;
  cursor: string;
  onActivate(canvas: FabricCanvas): void;
  onDeactivate(canvas: FabricCanvas): void;
  onMouseDown(canvas: FabricCanvas, pointer: ToolPointer, e: MouseEvent): void;
  onMouseMove(canvas: FabricCanvas, pointer: ToolPointer, e: MouseEvent): void;
  onMouseUp(canvas: FabricCanvas, pointer: ToolPointer, e: MouseEvent): void;
}
