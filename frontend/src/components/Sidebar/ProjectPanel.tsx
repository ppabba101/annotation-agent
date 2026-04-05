import { useProjectStore } from '@/stores/projectStore';

export function ProjectPanel() {
  const {
    projectName,
    pages,
    currentPageIndex,
    setCurrentPage,
    addPage,
    deletePage,
  } = useProjectStore();

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</h2>
      </div>

      <p className="text-sm text-gray-200 font-medium truncate mb-4" title={projectName}>
        {projectName}
      </p>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">Pages ({pages.length})</span>
        <button
          onClick={addPage}
          title="New page"
          className="text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          + New
        </button>
      </div>

      <ul className="space-y-1">
        {pages.map((page, i) => (
          <li key={page.id}>
            <div
              className={`
                flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group
                ${currentPageIndex === i
                  ? 'bg-indigo-900/60 text-indigo-200'
                  : 'hover:bg-gray-800 text-gray-400'}
              `}
              onClick={() => setCurrentPage(i)}
            >
              {/* Thumbnail placeholder */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-8 h-10 rounded bg-gray-700 shrink-0 flex items-center justify-center text-gray-600 text-xs">
                  {i + 1}
                </div>
                <span className="text-xs truncate">{page.label}</span>
              </div>
              {pages.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deletePage(i); }}
                  title="Delete page"
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs ml-1"
                >
                  ×
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
