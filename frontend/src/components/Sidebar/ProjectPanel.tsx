import { useRef } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStyleStore } from '@/stores/styleStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { loadPDF } from '@/components/Canvas/PDFLayer';

export function ProjectPanel() {
  const { projectName } = useProjectStore();
  const { currentStyleId, styleName } = useStyleStore();
  const { canvas } = useCanvasStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfOpen = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canvas) return;
    try {
      await loadPDF(file, 1, canvas);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
    e.target.value = '';
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</h2>
      </div>

      <p className="text-sm text-gray-200 font-medium truncate mb-4" title={projectName}>
        {projectName}
      </p>

      {/* Style status */}
      <div className="flex items-center gap-2 mb-4 px-2 py-2 rounded bg-gray-800/50 border border-gray-700/50">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${currentStyleId ? 'bg-green-500' : 'bg-gray-600'}`} />
        <div className="min-w-0">
          <p className="text-xs text-gray-300 truncate">{styleName}</p>
          <p className="text-xs text-gray-600">
            {currentStyleId ? 'Style ready' : 'No style loaded'}
          </p>
        </div>
      </div>

      {/* Open PDF */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
      />
      <button
        onClick={handlePdfOpen}
        className="w-full text-xs px-3 py-2.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors border border-gray-700 font-medium"
      >
        Open PDF
      </button>
    </div>
  );
}
