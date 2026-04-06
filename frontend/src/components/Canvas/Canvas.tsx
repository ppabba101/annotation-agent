import { useEffect, useRef, useCallback } from 'react';
import { Canvas as FabricCanvas, FabricText, Point } from 'fabric';
import { useCanvasStore } from '@/stores/canvasStore';
import { useStyleStore } from '@/stores/styleStore';
import { ToolDispatcher } from './tools';

export function Canvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dispatcherRef = useRef(new ToolDispatcher());
  const { setCanvas, canvas, activeTool } = useCanvasStore();
  const currentStyleId = useStyleStore((s) => s.currentStyleId);

  const initCanvas = useCallback(() => {
    const el = canvasElRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const fc = new FabricCanvas(el, {
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#ffffff',
      selection: true,
    });

    // Placeholder text
    const placeholder = new FabricText('Drop a PDF or start generating', {
      left: fc.width! / 2,
      top: fc.height! / 2,
      originX: 'center',
      originY: 'center',
      fontSize: 18,
      fill: '#9ca3af',
      selectable: false,
      evented: false,
      name: '__placeholder__',
    });
    fc.add(placeholder);
    fc.renderAll();

    setCanvas(fc);
    return fc;
  }, [setCanvas]);

  // Resize handler
  useEffect(() => {
    const fc = initCanvas();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !fc) return;
      const { width, height } = entry.contentRect;
      fc.setWidth(width);
      fc.setHeight(height);
      fc.renderAll();
    });

    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      fc?.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom via mouse wheel
  useEffect(() => {
    if (!canvas) return;
    const el = canvasElRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.1), 10);
      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      useCanvasStore.getState().setZoom(zoom);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canvas]);

  // Tool dispatcher: routes mouse/key events to active tool handler
  useEffect(() => {
    if (!canvas) return;
    const dispatcher = dispatcherRef.current;
    dispatcher.setActiveTool(canvas, activeTool);

    const handlers = {
      'mouse:down': (opt: { e: MouseEvent }) => dispatcher.onMouseDown(canvas, opt.e),
      'mouse:move': (opt: { e: MouseEvent }) => dispatcher.onMouseMove(canvas, opt.e),
      'mouse:up': (opt: { e: MouseEvent }) => dispatcher.onMouseUp(canvas, opt.e),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.on(handlers as any);

    const onKeyDown = (e: KeyboardEvent) => dispatcher.onKeyDown(e, canvas);
    const onKeyUp = (e: KeyboardEvent) => dispatcher.onKeyUp(e, canvas);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.off(handlers as any);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canvas, activeTool]);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-gray-800">
      <canvas ref={canvasElRef} />
      {!currentStyleId && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl px-6 py-4 border border-gray-700/50 text-center max-w-xs">
            <p className="text-sm text-gray-300 mb-1">Upload handwriting samples to get started</p>
            <p className="text-xs text-gray-500">Use the Style panel in the sidebar</p>
          </div>
        </div>
      )}
    </div>
  );
}
