import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  status?: 'pending' | 'ok' | 'error';
}

interface ChatState {
  messages: ChatMessage[];
  isProcessing: boolean;
  addMessage: (role: ChatMessage['role'], content: string) => void;
  updateLastMessage: (content: string, status?: ChatMessage['status']) => void;
  setProcessing: (processing: boolean) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,

  addMessage: (role, content) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date().toISOString(),
      status: role === 'user' ? 'ok' : 'pending',
    };
    set((state) => ({ messages: [...state.messages, msg] }));
  },

  updateLastMessage: (content, status) => {
    const { messages } = get();
    if (messages.length === 0) return;
    const updated = [...messages];
    updated[updated.length - 1] = {
      ...updated[updated.length - 1],
      content,
      status: status ?? updated[updated.length - 1].status,
    };
    set({ messages: updated });
  },

  setProcessing: (processing) => set({ isProcessing: processing }),

  clearHistory: () => set({ messages: [] }),
}));
