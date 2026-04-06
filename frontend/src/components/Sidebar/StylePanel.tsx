import { useStyleStore, PRESET_STYLES } from '@/stores/styleStore';

export function StylePanel() {
  const { currentStyleIndex, bias, setStyleIndex, setBias } = useStyleStore();

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Style</h2>
      </div>

      {/* Style grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {PRESET_STYLES.map((style) => (
          <button
            key={style.index}
            onClick={() => setStyleIndex(style.index)}
            className={`
              px-2 py-1.5 rounded text-xs transition-all
              ${currentStyleIndex === style.index
                ? 'bg-indigo-600 text-white ring-1 ring-indigo-400'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}
            `}
          >
            {style.name}
          </button>
        ))}
      </div>

      {/* Neatness slider */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Messy</span>
          <span>Neat</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={bias}
          onChange={(e) => setBias(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <p className="text-xs text-gray-600 text-center mt-1">
          Neatness: {(bias * 100).toFixed(0)}%
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-gray-500">
          Style: {PRESET_STYLES[currentStyleIndex]?.name ?? 'Unknown'}
        </span>
      </div>
    </div>
  );
}
