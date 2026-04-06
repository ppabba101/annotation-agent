/**
 * Annotation executor: takes resolved annotation plans from the backend
 * and creates Fabric.js objects on the canvas using existing drawing tools.
 */

import { Canvas as FabricCanvas, Path } from 'fabric';
import { wobbleEllipse, wobbleLine, wobbleArrow, highlightPath } from './wobble';
import { renderStrokes } from './strokeRenderer';
import { apiClient } from '@/services/api';
import type { StrokeResult } from '@/types/api';

export interface ResolvedAnnotation {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  text: string;
  color: string;
  max_width: number;
  style_index: number;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.3)',
  green: 'rgba(76, 175, 80, 0.3)',
  pink: 'rgba(233, 30, 99, 0.3)',
  blue: 'rgba(33, 150, 243, 0.3)',
};

/**
 * Execute a list of resolved annotations on the canvas.
 */
export async function executeAnnotations(
  canvas: FabricCanvas,
  annotations: ResolvedAnnotation[],
): Promise<void> {
  for (const ann of annotations) {
    switch (ann.type) {
      case 'highlight': {
        const color = HIGHLIGHT_COLORS[ann.color] ?? HIGHLIGHT_COLORS.yellow;
        const d = highlightPath(ann.x, ann.y, ann.width, ann.height);
        const path = new Path(d, {
          fill: color,
          stroke: 'transparent',
          strokeWidth: 0,
          selectable: true,
        });
        canvas.add(path);
        break;
      }

      case 'circle': {
        const cx = ann.x + ann.width / 2;
        const cy = ann.y + ann.height / 2;
        const rx = ann.width / 2;
        const ry = ann.height / 2;
        const d = wobbleEllipse(cx, cy, rx, ry);
        const path = new Path(d, {
          stroke: '#e53e3e',
          strokeWidth: 2,
          fill: 'transparent',
          selectable: true,
        });
        canvas.add(path);
        break;
      }

      case 'underline': {
        const d = wobbleLine(ann.x, ann.y + ann.height, ann.x + ann.width, ann.y + ann.height);
        const path = new Path(d, {
          stroke: '#e53e3e',
          strokeWidth: 2,
          fill: 'transparent',
          selectable: true,
        });
        canvas.add(path);
        break;
      }

      case 'arrow': {
        const d = wobbleArrow(ann.from_x, ann.from_y, ann.to_x, ann.to_y);
        const path = new Path(d, {
          stroke: '#e53e3e',
          strokeWidth: 2,
          fill: 'transparent',
          selectable: true,
        });
        canvas.add(path);
        break;
      }

      case 'margin_note': {
        if (!ann.text) break;
        try {
          const genRes = await apiClient.generate({
            text: ann.text,
            style_index: ann.style_index,
            bias: 0.75,
          });

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

          if (result && result.lines) {
            // Calculate scale to fit within max_width
            const noteMaxWidth = ann.max_width > 0 ? ann.max_width : 150;
            // The raw stroke width is total_width from the result
            const rawWidth = result.total_width || 200;
            const fitScale = Math.min(noteMaxWidth / rawWidth, 0.4);

            renderStrokes(canvas, result, {
              position: { x: ann.x, y: ann.y },
              scale: fitScale,
              strokeWidth: 1.0,
            });
          }
        } catch (err) {
          console.error('Failed to generate margin note:', err);
        }
        break;
      }
    }
  }

  canvas.requestRenderAll();
}
