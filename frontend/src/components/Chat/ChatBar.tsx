import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { ChatHistory } from './ChatHistory';
import { apiClient } from '@/services/api';
import { useCanvasStore } from '@/stores/canvasStore';
import { useStyleStore } from '@/stores/styleStore';
import { renderStrokes } from '@/lib/strokeRenderer';
import type { StrokeResult } from '@/types/api';

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
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await apiClient.getTaskStatus(taskId);
    onStatus(result.status);
    if (result.status === 'completed') return 'completed';
    if (result.status === 'failed') return 'failed';
    await new Promise((r) => setTimeout(r, 1000));
  }
  return 'timeout';
}

type InlineStatus = {
  text: string;
  type: 'info' | 'success' | 'error';
} | null;

export function ChatBar() {
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<InlineStatus>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const { addMessage, setProcessing, isProcessing } = useChatStore();
  const { activeTool, canvas } = useCanvasStore();

  const showStatus = useCallback((text: string, type: 'info' | 'success' | 'error') => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setInlineStatus({ text, type });
    if (type === 'success') {
      hideTimerRef.current = setTimeout(() => setInlineStatus(null), 5000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const submitGeneration = async (text: string) => {
    const { currentStyleIndex, bias } = useStyleStore.getState();

    showStatus('Generating handwriting...', 'info');
    useChatStore.getState().updateLastMessage('Submitting generation...', 'ok');

    try {
      const res = await apiClient.generate({
        text,
        style_index: currentStyleIndex,
        bias,
      });
      const taskId = res.task_id;

      showStatus('Generating handwriting...', 'info');

      const finalStatus = await pollTaskUntilDone(taskId, (status) => {
        showStatus(`Generating handwriting... (${status})`, 'info');
      });

      if (finalStatus === 'completed') {
        const result: StrokeResult = await apiClient.getTaskResult(taskId);

        if (result.lines && result.lines.length > 0 && canvas) {
          // Push undo BEFORE adding strokes
          useCanvasStore.getState().pushUndo();
          renderStrokes(canvas, result);
          showStatus('Done! Handwriting rendered.', 'success');
          useChatStore.getState().updateLastMessage('Handwriting generated on canvas.', 'ok');
        } else {
          showStatus('Generation returned empty result', 'error');
          useChatStore.getState().updateLastMessage('No strokes generated.', 'error');
        }
      } else if (finalStatus === 'failed') {
        showStatus('Generation failed', 'error');
        useChatStore.getState().updateLastMessage('Generation failed.', 'error');
      } else {
        showStatus('Generation timed out', 'error');
        useChatStore.getState().updateLastMessage('Generation timed out.', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      showStatus(`Failed: ${msg}`, 'error');
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
    showStatus('Processing command...', 'info');
    try {
      const canvasJson = canvas ? JSON.stringify(canvas.toJSON()) : undefined;
      const res = await apiClient.sendNLCommand({
        command: text,
        context: { pageId: 'current', activeTool, canvasJson },
      });
      useChatStore.getState().updateLastMessage(res.interpretation, 'ok');
      showStatus('Done!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      useChatStore.getState().updateLastMessage(`Error: ${msg}`, 'error');
      showStatus(`Failed: ${msg}`, 'error');
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

      {inlineStatus && (
        <div
          className={`px-4 py-2 text-xs font-medium flex items-center gap-2 border-b border-gray-800 ${
            inlineStatus.type === 'info'
              ? 'bg-indigo-950/50 text-indigo-300'
              : inlineStatus.type === 'success'
                ? 'bg-green-950/50 text-green-300'
                : 'bg-red-950/50 text-red-300'
          }`}
        >
          {inlineStatus.type === 'info' && (
            <span className="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          )}
          {inlineStatus.type === 'success' && <span className="text-green-400">&#10003;</span>}
          {inlineStatus.type === 'error' && <span className="text-red-400">&#10007;</span>}
          <span>{inlineStatus.text}</span>
          <button
            onClick={() => setInlineStatus(null)}
            className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
          >
            &#215;
          </button>
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
          placeholder="write: your text here — or type a command"
          disabled={isProcessing}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={() => void submit()}
          disabled={isProcessing || !input.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isProcessing ? 'Running\u2026' : 'Send'}
        </button>
      </div>
    </div>
  );
}
