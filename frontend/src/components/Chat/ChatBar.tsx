import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { ChatHistory } from './ChatHistory';
import { apiClient } from '@/services/api';
import { useCanvasStore } from '@/stores/canvasStore';
import { useStyleStore } from '@/stores/styleStore';

const BASE_URL = 'http://localhost:8000';

const GENERATE_PREFIXES = ['write:', 'generate:', 'gen:'] as const;

function parseGenerateCommand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const prefix of GENERATE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }
  return null;
}

async function pollTaskUntilDone(taskId: string, onStatus: (status: string) => void): Promise<string> {
  const maxAttempts = 120; // 2 minutes at 1s intervals
  for (let i = 0; i < maxAttempts; i++) {
    const result = await apiClient.getTaskStatus(taskId);
    onStatus(result.status);
    if (result.status === 'completed') return 'completed';
    if (result.status === 'failed') return 'failed';
    await new Promise((r) => setTimeout(r, 1000));
  }
  return 'timeout';
}

export function ChatBar() {
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addMessage, setProcessing, isProcessing } = useChatStore();
  const { activeTool, canvas } = useCanvasStore();

  const submitGeneration = async (text: string) => {
    const styleId = useStyleStore.getState().currentStyleId;
    if (!styleId) {
      useChatStore.getState().updateLastMessage(
        'No style selected. Upload handwriting samples first.',
        'error'
      );
      return;
    }

    useChatStore.getState().updateLastMessage('Submitting generation...', 'ok');

    try {
      const res = await apiClient.generate({ text, style_id: styleId });
      const taskId = res.task_id;

      useChatStore.getState().updateLastMessage(`Generating... (task: ${taskId.slice(0, 8)})`, 'ok');

      const finalStatus = await pollTaskUntilDone(taskId, (status) => {
        useChatStore.getState().updateLastMessage(`Status: ${status}...`, 'ok');
      });

      if (finalStatus === 'completed') {
        // Fetch the result to get the image URL
        try {
          const result = await apiClient.getTaskResult(taskId);
          const imageUrl = result.image_url as string | undefined;
          if (imageUrl) {
            // If it's a relative path, construct the full URL
            const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl}`;
            useCanvasStore.getState().loadImage(fullUrl);
            useChatStore.getState().updateLastMessage('Generation complete! Image loaded onto canvas.', 'ok');
          } else {
            // Try the static file path convention
            const staticUrl = `${BASE_URL}/static/samples/_generated/${taskId}_page.png`;
            useCanvasStore.getState().loadImage(staticUrl);
            useChatStore.getState().updateLastMessage('Generation complete! Image loaded onto canvas.', 'ok');
          }
        } catch {
          // Fallback: try static path
          const staticUrl = `${BASE_URL}/static/samples/_generated/${taskId}_page.png`;
          useCanvasStore.getState().loadImage(staticUrl);
          useChatStore.getState().updateLastMessage('Generation complete! Image loaded onto canvas.', 'ok');
        }
      } else if (finalStatus === 'failed') {
        useChatStore.getState().updateLastMessage('Generation failed. Please try again.', 'error');
      } else {
        useChatStore.getState().updateLastMessage('Generation timed out. Check back later.', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      useChatStore.getState().updateLastMessage(`Error: ${msg}`, 'error');
    }
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput('');
    addMessage('user', text);
    setProcessing(true);
    addMessage('assistant', '...');

    const generateText = parseGenerateCommand(text);

    if (generateText) {
      try {
        await submitGeneration(generateText);
      } finally {
        setProcessing(false);
      }
      return;
    }

    // Regular NL command
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
          placeholder="Type a command… (e.g. 'write: Hello world' or 'highlight all headings')"
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
