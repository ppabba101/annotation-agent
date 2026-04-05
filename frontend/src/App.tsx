import { useState } from 'react';
import { Canvas } from '@/components/Canvas/Canvas';
import { CanvasToolbar } from '@/components/Canvas/CanvasToolbar';
import { ChatBar } from '@/components/Chat/ChatBar';
import { ProjectPanel } from '@/components/Sidebar/ProjectPanel';
import { StylePanel } from '@/components/Sidebar/StylePanel';
import { ExportDialog } from '@/components/Export/ExportDialog';

export default function App() {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 min-w-64 bg-gray-900 border-r border-gray-800">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-200 tracking-wide">Annotation Agent</span>
          <button
            onClick={() => setExportOpen(true)}
            className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Export
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
          <ProjectPanel />
          <StylePanel />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        <CanvasToolbar />
        <div className="flex-1 relative overflow-hidden">
          <Canvas />
        </div>
        <ChatBar />
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
