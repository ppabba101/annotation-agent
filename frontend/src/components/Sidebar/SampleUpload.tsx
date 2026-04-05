import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useStyleStore } from '@/stores/styleStore';
import { apiClient } from '@/services/api';
import type { SampleInfo } from '@/types/project';

export function SampleUpload() {
  const { samples, addSample, removeSample } = useStyleStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (arr.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      // Optimistic add
      const tempSample: SampleInfo = {
        id: crypto.randomUUID(),
        filename: file.name,
        url: URL.createObjectURL(file),
        uploadedAt: new Date().toISOString(),
        status: 'pending',
      };
      addSample(tempSample);

      try {
        const res = await apiClient.uploadSample({ file });
        // Update with server response (replace temp)
        removeSample(tempSample.id);
        addSample({
          id: res.sampleId,
          filename: file.name,
          url: tempSample.url,
          uploadedAt: new Date().toISOString(),
          status: 'uploaded',
        });
      } catch {
        removeSample(tempSample.id);
        addSample({ ...tempSample, status: 'error' });
      }

      setUploadProgress(Math.round(((i + 1) / arr.length) * 100));
    }

    setUploading(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${isDragging
            ? 'border-indigo-500 bg-indigo-900/20'
            : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'}
        `}
      >
        <p className="text-xs text-gray-500">
          Drop images here<br />or click to browse
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Sample list */}
      {samples.length > 0 && (
        <ul className="space-y-1">
          {samples.map((s) => (
            <li key={s.id} className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded bg-gray-800 overflow-hidden shrink-0">
                <img src={s.url} alt={s.filename} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 truncate">{s.filename}</p>
                <p className={`text-xs ${s.status === 'error' ? 'text-red-400' : s.status === 'uploaded' ? 'text-green-500' : 'text-gray-500'}`}>
                  {s.status}
                </p>
              </div>
              <button
                onClick={() => removeSample(s.id)}
                title="Remove"
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-sm shrink-0"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
