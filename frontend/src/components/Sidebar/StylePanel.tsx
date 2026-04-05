import { useState } from 'react';
import { useStyleStore } from '@/stores/styleStore';
import { SampleUpload } from './SampleUpload';

export function StylePanel() {
  const { styleName, isTraining, trainingProgress, currentStyleId } = useStyleStore();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Style</h2>
      </div>

      <p className="text-sm text-gray-200 font-medium truncate mb-1" title={styleName}>
        {styleName}
      </p>
      {currentStyleId && (
        <p className="text-xs text-gray-600 mb-3 truncate" title={currentStyleId}>
          ID: {currentStyleId.slice(0, 12)}…
        </p>
      )}

      {/* Style preview placeholder */}
      <div className="w-full h-16 rounded bg-gray-800 border border-gray-700 flex items-center justify-center mb-3">
        <span className="text-xs text-gray-600">Style preview</span>
      </div>

      {/* Training status */}
      {isTraining && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Training…</span>
            <span>{trainingProgress}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${trainingProgress}%` }}
            />
          </div>
        </div>
      )}

      {!isTraining && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className={`w-2 h-2 rounded-full ${currentStyleId ? 'bg-green-500' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-500">
            {currentStyleId ? 'Style ready' : 'No style loaded'}
          </span>
        </div>
      )}

      <button
        onClick={() => setUploadOpen((v) => !v)}
        className="w-full text-xs px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
      >
        {uploadOpen ? 'Hide Upload' : 'Upload Samples'}
      </button>

      {uploadOpen && (
        <div className="mt-3">
          <SampleUpload />
        </div>
      )}
    </div>
  );
}
