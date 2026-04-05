import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { ChatHistory } from './ChatHistory';
import { apiClient } from '@/services/api';
import { useCanvasStore } from '@/stores/canvasStore';

export function ChatBar() {
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addMessage, setProcessing, isProcessing } = useChatStore();
  const { activeTool, canvas } = useCanvasStore();

  const submit = async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput('');
    addMessage('user', text);
    setProcessing(true);
    addMessage('assistant', '...');

    try {
      const canvasJson = canvas ? JSON.stringify(canvas.toJSON()) : undefined;
      const res = await apiClient.sendNLCommand({
        command: text,
        context: { pageId: 'current', activeTool, canvasJson },
      });
      useChatStore.getState().updateLastMessage(res.interpretation, 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      useChatStore.getState().updateLastMessage(`Error: ${msg}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="border-t border-gray-800 bg-gray-900">
      {historyOpen && (
        <div className="border-b border-gray-800 max-h-64 overflow-y-auto">
          <ChatHistory />
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          title="Toggle history"
          className="text-gray-500 hover:text-gray-300 transition-colors text-xs px-2 py-1 rounded hover:bg-gray-800"
        >
          {historyOpen ? 'Hide' : 'History'}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command… (e.g. 'highlight all headings')"
          disabled={isProcessing}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={() => void submit()}
          disabled={isProcessing || !input.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isProcessing ? 'Running…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
