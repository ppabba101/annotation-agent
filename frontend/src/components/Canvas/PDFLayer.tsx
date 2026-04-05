import type { Canvas as FabricCanvas } from 'fabric';
import { FabricImage } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export async function loadPDF(
  file: File,
  pageNum: number,
  fabricCanvas: FabricCanvas
): Promise<void> {
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

  await new Promise<void>((resolve, reject) => {
    FabricImage.fromURL(dataUrl)
      .then((img) => {
        const scaleX = fabricCanvas.width! / img.width!;
        const scaleY = fabricCanvas.height! / img.height!;
        const scale = Math.min(scaleX, scaleY);

        img.set({ scaleX: scale, scaleY: scale, selectable: false, evented: false });
        fabricCanvas.backgroundImage = img;
        fabricCanvas.renderAll();
        resolve();
      })
      .catch(reject);
  });
}

export async function getPDFPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}
