import { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

type ExportFormat = 'pdf' | 'png';

interface Props {
  onClose: () => void;
}

export function ExportDialog({ onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [dpi, setDpi] = useState(150);
  const [exporting, setExporting] = useState(false);
  const { canvas } = useCanvasStore();

  const handleExport = async () => {
    if (!canvas) return;
    setExporting(true);

    try {
      if (format === 'png') {
        const dataUrl = canvas.toDataURL({
          format: 'png',
          multiplier: dpi / 96,
        });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `annotation-export.png`;
        link.click();
      } else {
        // PDF export: render canvas to image, then embed
        // Full PDF export requires jsPDF or backend; for now download PNG
        const dataUrl = canvas.toDataURL({ format: 'png', multiplier: dpi / 96 });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `annotation-export-page.png`;
        link.click();
      }
    } finally {
      setExporting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-100">Export</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Format */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-2">Format</label>
          <div className="flex gap-2">
            {(['png', 'pdf'] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`
                  flex-1 py-2 rounded-lg text-xs font-medium transition-colors border
                  ${format === f
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'}
                `}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* DPI */}
        <div className="mb-6">
          <label className="block text-xs text-gray-400 mb-2">
            Quality / DPI: <span className="text-gray-200">{dpi}</span>
          </label>
          <input
            type="range"
            min={72}
            max={300}
            step={1}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>72 (Screen)</span>
            <span>300 (Print)</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={exporting || !canvas}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
