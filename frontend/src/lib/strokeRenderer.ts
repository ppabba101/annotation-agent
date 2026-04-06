/**
 * Stroke renderer: converts SVG path d-strings from the backend
 * into Fabric.js Path objects on the canvas.
 *
 * Each line of generated handwriting becomes a Group of Path objects
 * that is selectable, movable, and deletable.
 */

import { Canvas as FabricCanvas, Path, Group } from 'fabric';

export interface StrokeLine {
  d: string;
  bbox: { x: number; y: number; width: number; height: number };
  text_content: string;
}

export interface StrokeResult {
  lines: StrokeLine[];
  total_width: number;
  total_height: number;
}

/**
 * Render stroke paths onto the Fabric.js canvas as a movable group.
 *
 * @param canvas - The Fabric.js canvas instance
 * @param result - Stroke generation result from the backend
 * @param options - Rendering options (color, width, position)
 */
export function renderStrokes(
  canvas: FabricCanvas,
  result: StrokeResult,
  options?: {
    strokeColor?: string;
    strokeWidth?: number;
    position?: { x: number; y: number };
    scale?: number;
  },
): Group | null {
  const color = options?.strokeColor ?? '#1a1a2e';
  const width = options?.strokeWidth ?? 1.8;
  const targetScale = options?.scale ?? 1.0;

  if (!result.lines || result.lines.length === 0) return null;

  const paths: Path[] = [];

  for (const line of result.lines) {
    if (!line.d || line.d.trim() === '') continue;

    const path = new Path(line.d, {
      stroke: color,
      strokeWidth: width,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      fill: 'transparent',
      selectable: false, // individual paths not selectable, the group is
      evented: false,
      // Offset for multi-line: shift Y by the line's bbox.y
      top: line.bbox.y * targetScale,
      left: 0,
      scaleX: targetScale,
      scaleY: targetScale,
    });

    paths.push(path);
  }

  if (paths.length === 0) return null;

  // Group all paths into one selectable/movable object
  const group = new Group(paths, {
    selectable: true,
    evented: true,
    originX: 'center',
    originY: 'center',
  });
  // Set name after construction (not in GroupProps)
  (group as unknown as { name: string }).name = 'generated-handwriting';

  // Position the group
  if (options?.position) {
    group.set({
      left: options.position.x,
      top: options.position.y,
      originX: 'left',
      originY: 'top',
    });
  } else {
    // Center on canvas
    group.set({
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
    });
  }

  // Remove placeholder if present
  const placeholder = canvas.getObjects().find(
    (obj) => (obj as { name?: string }).name === '__placeholder__'
  );
  if (placeholder) canvas.remove(placeholder);

  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();

  return group;
}
