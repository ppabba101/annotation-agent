import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useStyleStore } from '@/stores/styleStore';
import { apiClient } from '@/services/api';
import type { SampleInfo } from '@/types/project';

export function SampleUpload() {
  const { samples, addSample, removeSample } = useStyleStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)
    );
    if (arr.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('idle');
    setStatusMessage('');

    // Add optimistic previews
    const tempSamples: SampleInfo[] = arr.map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      url: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
      status: 'pending' as const,
    }));
    tempSamples.forEach((s) => addSample(s));
    setUploadProgress(30);

    try {
      const styleName = `Style ${new Date().toLocaleTimeString()}`;
      const res = await apiClient.uploadStyle(styleName, arr);
      setUploadProgress(100);

      // Set the active style from the response
      useStyleStore.getState().setStyle(res.style_id, res.name);

      // Update temp samples to uploaded status
      tempSamples.forEach((s) => {
        removeSample(s.id);
        addSample({ ...s, status: 'uploaded' });
      });

      setUploadStatus('success');
      setStatusMessage(`Style "${res.name}" created with ${res.sample_count} samples`);
    } catch (err) {
      // Mark all temp samples as error
      tempSamples.forEach((s) => {
        removeSample(s.id);
        addSample({ ...s, status: 'error' });
      });

      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus('error');
      setStatusMessage(msg);
    } finally {
      setUploading(false);
    }
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
      {/* Instructions */}
      <p className="text-xs text-gray-500 mb-2">
        Upload a photo of your handwriting — any page of writing works.
        The more text, the better the style capture.
      </p>
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
          accept="image/*,.heic,.heif"
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

      {/* Status message */}
      {uploadStatus !== 'idle' && (
        <p className={`text-xs ${uploadStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {statusMessage}
        </p>
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
