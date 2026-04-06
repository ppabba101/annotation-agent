import { useRef, type ChangeEvent } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { loadPDF, getPDFPageCount } from '@/components/Canvas/PDFLayer';

export function ProjectPanel() {
  const { canvas, pdfCurrentPage, pdfTotalPages, pdfFile, setPdfFile, setPdfCurrentPage } = useCanvasStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openPDF = async (file: File) => {
    if (!canvas) return;
    await loadPDF(file, 1, canvas);
    const count = await getPDFPageCount(file);
    setPdfFile(file, count);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void openPDF(file);
    e.target.value = '';
  };

  const navigatePage = async (delta: number) => {
    if (!pdfFile || !canvas) return;
    const newPage = pdfCurrentPage + delta;
    if (newPage < 1 || newPage > pdfTotalPages) return;
    await loadPDF(pdfFile, newPage, canvas);
    setPdfCurrentPage(newPage);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</h2>
      </div>

      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full text-xs px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700 mb-3"
      >
        Open PDF
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {pdfTotalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
          <button
            onClick={() => void navigatePage(-1)}
            disabled={pdfCurrentPage <= 1}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30"
          >
            Prev
          </button>
          <span>Page {pdfCurrentPage} / {pdfTotalPages}</span>
          <button
            onClick={() => void navigatePage(1)}
            disabled={pdfCurrentPage >= pdfTotalPages}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}

      <p className="text-xs text-gray-600">
        Type <span className="text-gray-400 font-mono">write: your text</span> in the chat bar to generate handwriting.
      </p>
    </div>
  );
}
