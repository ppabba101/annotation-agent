import type { Canvas as FabricCanvas } from 'fabric';
import { FabricImage } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useCanvasStore } from '@/stores/canvasStore';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/** ID used to find and replace the text layer overlay */
const TEXT_LAYER_ID = 'pdf-text-layer';

/**
 * Remove any existing PDF text layer overlay from the canvas container.
 */
function removeTextLayer(fabricCanvas: FabricCanvas): void {
  const canvasEl = fabricCanvas.getElement();
  const container = canvasEl.parentElement;
  if (!container) return;
  const existing = container.querySelector(`#${TEXT_LAYER_ID}`);
  if (existing) existing.remove();
}

/**
 * Create a transparent PDF.js text layer overlay on top of the Fabric canvas.
 * This allows users to select and copy text from the rendered PDF.
 */
async function createTextLayer(
  fabricCanvas: FabricCanvas,
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  scale: number,
): Promise<void> {
  const canvasEl = fabricCanvas.getElement();
  const container = canvasEl.parentElement;
  if (!container) return;

  // Remove any previous text layer
  removeTextLayer(fabricCanvas);

  // Create the text layer container
  const textLayerDiv = document.createElement('div');
  textLayerDiv.id = TEXT_LAYER_ID;
  textLayerDiv.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: ${viewport.width * scale}px;
    height: ${viewport.height * scale}px;
    overflow: hidden;
    pointer-events: auto;
    opacity: 0.3;
    line-height: 1.0;
    z-index: 2;
  `;

  // The text layer needs to be above the canvas but allow click-through
  // for annotation tools. We set pointer-events on the div, but individual
  // spans will capture text selection.
  container.style.position = 'relative';
  container.appendChild(textLayerDiv);

  const textContent = await page.getTextContent();

  // Create a scaled viewport that matches the final display size
  const scaledViewport = page.getViewport({ scale: 1.5 * scale });

  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: scaledViewport,
  });

  await textLayer.render();

  // Style the text spans for selection: transparent text over the PDF image
  const spans = textLayerDiv.querySelectorAll('span');
  spans.forEach((span) => {
    span.style.color = 'transparent';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'pre';
    span.style.pointerEvents = 'auto';
  });

  // When user is not selecting text, let events pass through to canvas
  textLayerDiv.style.pointerEvents = 'none';

  // Enable pointer events only during text selection
  textLayerDiv.addEventListener('mousedown', (e) => {
    // Only enable text selection on left click without tool active
    const activeTool = useCanvasStore.getState().activeTool;
    if (activeTool === 'select' && e.button === 0) {
      textLayerDiv.style.pointerEvents = 'auto';
      spans.forEach((span) => {
        span.style.pointerEvents = 'auto';
      });
    }
  });

  document.addEventListener('mouseup', () => {
    // After selection ends, restore pass-through
    textLayerDiv.style.pointerEvents = 'none';
  }, { once: false });
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

  // Remove previous text layer
  removeTextLayer(fabricCanvas);

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  // Render to an off-screen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;

  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for PDF rendering');

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Set as Fabric.js background image, scaled to fit
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

  // Create text layer overlay for text selection
  await createTextLayer(fabricCanvas, page, viewport, bgScale);
}

export async function getPDFPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}
