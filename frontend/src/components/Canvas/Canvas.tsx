import { useEffect, useRef, useCallback } from 'react';
import { Canvas as FabricCanvas, FabricText, Point } from 'fabric';
import { useCanvasStore } from '@/stores/canvasStore';

export function Canvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setCanvas, canvas } = useCanvasStore();

  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);

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

  // Pan via middle-click or spacebar+drag
  useEffect(() => {
    if (!canvas) return;

    const onMouseDown = (opt: { e: MouseEvent }) => {
      const e = opt.e;
      if (e.button === 1 || spaceDown.current) {
        isPanning.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        canvas.setCursor('grabbing');
        e.preventDefault();
      }
    };

    const onMouseMove = (opt: { e: MouseEvent }) => {
      if (!isPanning.current) return;
      const e = opt.e;
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      vpt[4] += e.clientX - lastPos.current.x;
      vpt[5] += e.clientY - lastPos.current.y;
      canvas.requestRenderAll();
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isPanning.current = false;
      canvas.setCursor('default');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = true;
        canvas.setCursor('grab');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        canvas.setCursor('default');
      }
    };

    // Fabric.js v6 event registration via object handlers
    const handlers = {
      'mouse:down': onMouseDown,
      'mouse:move': onMouseMove,
      'mouse:up': onMouseUp,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.on(handlers as any);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.off(handlers as any);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canvas]);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-gray-800">
      <canvas ref={canvasElRef} />
    </div>
  );
}
