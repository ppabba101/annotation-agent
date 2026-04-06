import type { Canvas as FabricCanvas } from 'fabric';
import type { ToolHandler, ToolPointer } from './types';
import { apiClient } from '@/services/api';
import { renderStrokes } from '@/lib/strokeRenderer';
import { useCanvasStore } from '@/stores/canvasStore';
import { useStyleStore } from '@/stores/styleStore';
import type { StrokeResult } from '@/types/api';

/**
 * Pen tool: click a spot on the canvas to place a margin note.
 * A small text input appears at the click location. The user types text,
 * presses Enter, and the tool calls the generate API to render
 * handwritten strokes at that position.
 */
export class PenTool implements ToolHandler {
  name = 'pen';
  cursor = 'crosshair';
  private inputEl: HTMLInputElement | null = null;
  private overlay: HTMLDivElement | null = null;

  onActivate(_canvas: FabricCanvas): void {
    _canvas.selection = false;
  }

  onDeactivate(canvas: FabricCanvas): void {
    this.removeInput(canvas);
  }

  onMouseDown(canvas: FabricCanvas, pointer: ToolPointer, e: MouseEvent): void {
    if (e.button !== 0) return;

    // If there's already an input open, remove it
    if (this.inputEl) {
      this.removeInput(canvas);
      return;
    }

    this.showInput(canvas, pointer);
  }

  onMouseMove(_canvas: FabricCanvas, _pointer: ToolPointer, _e: MouseEvent): void {
    // No drag behavior
  }

  onMouseUp(_canvas: FabricCanvas, _pointer: ToolPointer, _e: MouseEvent): void {
    // No drag behavior
  }

  private showInput(canvas: FabricCanvas, pointer: ToolPointer): void {
    const canvasEl = canvas.getElement();
    const container = canvasEl.parentElement;
    if (!container) return;

    // Convert canvas coords to screen coords using viewport transform
    const vpt = canvas.viewportTransform;
    let screenX = pointer.x;
    let screenY = pointer.y;
    if (vpt) {
      screenX = pointer.x * vpt[0] + vpt[4];
      screenY = pointer.y * vpt[3] + vpt[5];
    }

    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'absolute';
    this.overlay.style.left = `${screenX}px`;
    this.overlay.style.top = `${screenY}px`;
    this.overlay.style.zIndex = '1000';

    // Create text input
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Type note, press Enter...';
    this.inputEl.style.cssText = `
      width: 200px;
      padding: 4px 8px;
      font-size: 13px;
      border: 2px solid #6366f1;
      border-radius: 6px;
      background: #1f2937;
      color: #f3f4f6;
      outline: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;

    const canvasPointer = { x: pointer.x, y: pointer.y };

    this.inputEl.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        const text = this.inputEl?.value.trim();
        if (text) {
          void this.generateNote(canvas, canvasPointer, text);
        }
        this.removeInput(canvas);
      } else if (ev.key === 'Escape') {
        ev.stopPropagation();
        this.removeInput(canvas);
      }
    });

    // Stop event propagation so canvas doesn't receive these events
    this.inputEl.addEventListener('mousedown', (ev) => ev.stopPropagation());

    this.overlay.appendChild(this.inputEl);
    container.appendChild(this.overlay);
    this.inputEl.focus();
  }

  private removeInput(_canvas: FabricCanvas): void {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = null;
    this.inputEl = null;
  }

  private async generateNote(
    canvas: FabricCanvas,
    position: ToolPointer,
    text: string,
  ): Promise<void> {
    const { currentStyleIndex, bias } = useStyleStore.getState();

    try {
      useCanvasStore.getState().pushUndo();

      const genRes = await apiClient.generate({
        text,
        style_index: currentStyleIndex,
        bias,
      });

      // Poll for completion
      let result: StrokeResult | null = null;
      for (let i = 0; i < 60; i++) {
        const status = await apiClient.getTaskStatus(genRes.task_id);
        if (status.status === 'completed') {
          result = await apiClient.getTaskResult(genRes.task_id);
          break;
        }
        if (status.status === 'failed') break;
        await new Promise((r) => setTimeout(r, 500));
      }

      if (result && result.lines && result.lines.length > 0) {
        renderStrokes(canvas, result, {
          position: { x: position.x, y: position.y },
          scale: 0.6,
          strokeWidth: 1.2,
        });
      }
    } catch (err) {
      console.error('Failed to generate pen note:', err);
    }
  }
}
