import type { Canvas as FabricCanvas } from 'fabric';
import { FabricImage } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useCanvasStore } from '@/stores/canvasStore';

// Import the official PDF.js text layer CSS for proper span positioning
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const TEXT_LAYER_ID = 'pdf-text-layer';

function removeTextLayer(fabricCanvas: FabricCanvas): void {
  const canvasEl = fabricCanvas.getElement();
  const container = canvasEl.parentElement;
  if (!container) return;
  const existing = container.querySelector(`#${TEXT_LAYER_ID}`);
  if (existing) existing.remove();
}

/**
 * Create a PDF.js text layer for text selection/copy.
 *
 * Strategy for pointer-events:
 * - The text layer starts with pointer-events: none
 * - A transparent overlay button in the toolbar toggles text selection mode
 * - When the user holds Ctrl/Cmd or is in Select mode, text layer activates
 * - This prevents the text layer from blocking annotation tools
 */
async function createTextLayer(
  fabricCanvas: FabricCanvas,
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  bgScale: number,
): Promise<void> {
  const canvasEl = fabricCanvas.getElement();
  const container = canvasEl.parentElement;
  if (!container) return;

  removeTextLayer(fabricCanvas);

  // Container for the text layer — uses PDF.js "textLayer" class for proper CSS
  const textLayerDiv = document.createElement('div');
  textLayerDiv.id = TEXT_LAYER_ID;
  textLayerDiv.className = 'textLayer';

  const displayWidth = viewport.width * bgScale;
  const displayHeight = viewport.height * bgScale;

  textLayerDiv.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: ${displayWidth}px;
    height: ${displayHeight}px;
    z-index: 2;
    pointer-events: none;
    user-select: text;
    -webkit-user-select: text;
  `;

  container.style.position = 'relative';
  container.appendChild(textLayerDiv);

  const textContent = await page.getTextContent();
  const scaledViewport = page.getViewport({ scale: 1.5 * bgScale });

  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: scaledViewport,
  });

  await textLayer.render();

  // Listen for Ctrl/Cmd key to enable text selection temporarily
  const enableSelection = () => {
    textLayerDiv.style.pointerEvents = 'auto';
  };
  const disableSelection = () => {
    // Only disable if no text is currently selected
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      textLayerDiv.style.pointerEvents = 'none';
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) enableSelection();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!e.metaKey && !e.ctrlKey) {
      // Delay to allow copy shortcut to complete
      setTimeout(disableSelection, 200);
    }
  };
  const onMouseUp = () => {
    // After any mouse up, check if we should disable
    setTimeout(disableSelection, 300);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);

  // Store cleanup functions on the element for removal
  (textLayerDiv as any).__cleanup = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

export async function loadPDF(
  file: File,
  pageNum: number,
  fabricCanvas: FabricCanvas
): Promise<void> {
  // Remove placeholder text if present
  const objects = fabricCanvas.getObjects();
  const placeholder = objects.find(
    (obj: any) => obj.name === '__placeholder__'
  );
  if (placeholder) {
    fabricCanvas.remove(placeholder);
  }

  // Clean up previous text layer event listeners
  const canvasEl = fabricCanvas.getElement();
  const container = canvasEl.parentElement;
  if (container) {
    const old = container.querySelector(`#${TEXT_LAYER_ID}`) as any;
    if (old?.__cleanup) old.__cleanup();
  }
  removeTextLayer(fabricCanvas);

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  const offscreen = document.createElement('canvas');
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;

  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for PDF rendering');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = offscreen.toDataURL('image/png');

  const bgScale = await new Promise<number>((resolve, reject) => {
    FabricImage.fromURL(dataUrl)
      .then((img) => {
        const scaleX = fabricCanvas.width! / img.width!;
        const scaleY = fabricCanvas.height! / img.height!;
        const scale = Math.min(scaleX, scaleY);
        useCanvasStore.getState().setPdfScales(1.5, scale);

        img.set({ scaleX: scale, scaleY: scale, selectable: false, evented: false });
        fabricCanvas.backgroundImage = img;
        fabricCanvas.renderAll();
        resolve(scale);
      })
      .catch(reject);
  });

  await createTextLayer(fabricCanvas, page, viewport, bgScale);
}

export async function getPDFPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}
