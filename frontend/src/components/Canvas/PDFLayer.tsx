import type { Canvas as FabricCanvas } from 'fabric';
import { FabricImage } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useCanvasStore } from '@/stores/canvasStore';

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
 * Create a PDF.js text layer that sits on top of the canvas.
 * The layer is invisible but allows text selection and copy.
 *
 * Key design: pointer-events are ALWAYS enabled on the text layer.
 * The text is fully transparent so it doesn't obscure the canvas.
 * When the user selects text, the browser's native selection works.
 * Annotation tools work because they use Fabric.js events on the
 * canvas element UNDERNEATH the text layer.
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

  const textLayerDiv = document.createElement('div');
  textLayerDiv.id = TEXT_LAYER_ID;

  // Position the text layer exactly over the PDF background image
  const displayWidth = viewport.width * bgScale;
  const displayHeight = viewport.height * bgScale;

  textLayerDiv.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: ${displayWidth}px;
    height: ${displayHeight}px;
    overflow: hidden;
    z-index: 2;
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

  // Make text spans transparent but selectable
  const spans = textLayerDiv.querySelectorAll('span');
  spans.forEach((span) => {
    span.style.color = 'transparent';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
  });

  // The text layer captures mouse events for text selection.
  // To let annotation tools work, we intercept and forward non-selection events.
  // Strategy: text layer catches mousedown. If no text is under the cursor,
  // or if a drawing tool is active, pass the event through to the canvas.
  textLayerDiv.addEventListener('mousedown', () => {
    const activeTool = useCanvasStore.getState().activeTool;

    // If a drawing tool is active (not select), pass through to canvas
    if (activeTool !== 'select') {
      textLayerDiv.style.pointerEvents = 'none';
      // Re-enable after a tick so future selections work
      requestAnimationFrame(() => {
        textLayerDiv.style.pointerEvents = 'auto';
      });
      return;
    }

    // In select mode: allow text selection naturally
    // The browser handles text selection on the spans
  });

  // Keep pointer events enabled so text selection works
  textLayerDiv.style.pointerEvents = 'auto';
}

export async function loadPDF(
  file: File,
  pageNum: number,
  fabricCanvas: FabricCanvas
): Promise<void> {
  // Remove placeholder text if present
  const objects = fabricCanvas.getObjects();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placeholder = objects.find((obj: any) => obj.name === '__placeholder__');
  if (placeholder) {
    fabricCanvas.remove(placeholder);
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
