import { useCanvasStore } from '@/stores/canvasStore';
import { HIGHLIGHT_COLORS } from '@/components/Canvas/tools/HighlightTool';
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

const COLOR_SWATCHES: { name: string; value: string; bg: string }[] = [
  { name: 'Yellow', value: HIGHLIGHT_COLORS.yellow, bg: 'bg-yellow-400' },
  { name: 'Green', value: HIGHLIGHT_COLORS.green, bg: 'bg-green-500' },
  { name: 'Pink', value: HIGHLIGHT_COLORS.pink, bg: 'bg-pink-500' },
  { name: 'Blue', value: HIGHLIGHT_COLORS.blue, bg: 'bg-blue-500' },
];

export function CanvasToolbar() {
  const { activeTool, setActiveTool, highlightColor, setHighlightColor, undo, redo } =
    useCanvasStore();

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

      {activeTool === 'highlight' && (
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-700">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.name}
              onClick={() => setHighlightColor(swatch.value)}
              title={swatch.name}
              className={`
                w-5 h-5 rounded-full ${swatch.bg} transition-transform
                ${highlightColor === swatch.value
                  ? 'ring-2 ring-white scale-110'
                  : 'opacity-70 hover:opacity-100'}
              `}
            />
          ))}
        </div>
      )}

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
