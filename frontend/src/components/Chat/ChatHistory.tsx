import { useEffect, useRef } from 'react';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function statusColor(msg: ChatMessage): string {
  if (msg.role === 'user') return 'text-indigo-400';
  if (msg.status === 'error') return 'text-red-400';
  if (msg.status === 'pending') return 'text-gray-500 italic';
  return 'text-gray-200';
}

export function ChatHistory() {
  const { messages, clearHistory } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-gray-500 text-center">
        No commands yet
      </div>
    );
  }

  return (
    <div className="px-4 py-2 space-y-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500 font-medium">Command History</span>
        <button
          onClick={clearHistory}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Clear
        </button>
      </div>
      {messages.map((msg) => (
        <div key={msg.id} className="flex gap-2 items-start py-0.5">
          <span className="text-xs text-gray-600 shrink-0 w-12 text-right">
            {formatTime(msg.timestamp)}
          </span>
          <span className="text-xs text-gray-500 shrink-0 w-14">
            {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Agent' : 'System'}
          </span>
          <span className={`text-xs flex-1 ${statusColor(msg)}`}>
            {msg.content}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
