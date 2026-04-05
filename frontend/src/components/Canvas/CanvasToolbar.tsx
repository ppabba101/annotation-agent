import { useCanvasStore } from '@/stores/canvasStore';
import type { ToolType } from '@/types/canvas';

interface Tool {
  id: ToolType;
  label: string;
  shortcut: string;
}

const TOOLS: Tool[] = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'highlight', label: 'Highlight', shortcut: 'H' },
  { id: 'pen', label: 'Pen', shortcut: 'P' },
  { id: 'circle', label: 'Circle', shortcut: 'C' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A' },
  { id: 'underline', label: 'Underline', shortcut: 'U' },
];

export function CanvasToolbar() {
  const { activeTool, setActiveTool, undo, redo } = useCanvasStore();

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-900 border-b border-gray-800">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          className={`
            px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${activeTool === tool.id
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}
          `}
        >
          {tool.label}
        </button>
      ))}

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={undo}
          title="Undo (Ctrl+Z)"
          className="px-3 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          Undo
        </button>
        <button
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
          className="px-3 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          Redo
        </button>
      </div>
    </div>
  );
}
