import type { ProgressEvent } from '@/types/api';

type ProgressHandler = (event: ProgressEvent) => void;

const WS_URL = 'ws://localhost:8000/ws/progress';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<ProgressHandler>>();
  private globalHandlers = new Set<ProgressHandler>();
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as ProgressEvent;
        this.dispatch(data);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      // Connection errors are handled via onclose + reconnect
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private dispatch(event: ProgressEvent): void {
    const handlers = this.subscribers.get(event.taskId);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
    this.globalHandlers.forEach((h) => h(event));
  }

  subscribe(taskId: string, handler: ProgressHandler): () => void {
    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Set());
    }
    this.subscribers.get(taskId)!.add(handler);

    return () => {
      const set = this.subscribers.get(taskId);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this.subscribers.delete(taskId);
      }
    };
  }

  subscribeAll(handler: ProgressHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
