"use client";

import * as React from "react";

export type WsStatus = "connecting" | "open" | "closing" | "closed" | "error";

export interface UseSocketOptions {
  url?: string | null;
  enabled?: boolean;
  protocols?: string | string[];
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  heartbeatIntervalMs?: number;
  query?: Record<string, string>;
  onMessage?: (event: MessageEvent<string>) => void;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

export interface UseSocketResult {
  status: WsStatus;
  lastMessage: string | null;
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => boolean;
  sendJson: (payload: unknown) => boolean;
  close: (code?: number, reason?: string) => void;
  reconnect: () => void;
}

function buildUrl(url: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return url;
  const qs = new URLSearchParams(query).toString();
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

export function useSocket({
  url,
  enabled = true,
  protocols,
  reconnect = true,
  maxReconnectAttempts = 10,
  reconnectDelayMs = 2000,
  heartbeatIntervalMs,
  query,
  onMessage,
  onOpen,
  onClose,
  onError,
}: UseSocketOptions = {}): UseSocketResult {
  const socketRef = React.useRef<WebSocket | null>(null);
  const attemptsRef = React.useRef(0);
  const manualCloseRef = React.useRef(false);
  const heartbeatRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = React.useState<WsStatus>("closed");
  const [lastMessage, setLastMessage] = React.useState<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);

  const optionsRef = React.useRef({ onMessage, onOpen, onClose, onError });
  React.useEffect(() => {
    optionsRef.current = { onMessage, onOpen, onClose, onError };
  });

  const connect = React.useCallback(() => {
    if (!enabled || !url) return;
    manualCloseRef.current = false;
    const wsUrl = buildUrl(url, query);
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, protocols);
    } catch {
      setStatus("error");
      if (reconnect && attemptsRef.current < maxReconnectAttempts) {
        attemptsRef.current += 1;
        setRetryCount((c) => c + 1);
      }
      return;
    }
    socketRef.current = ws;
    setStatus("connecting");

    ws.onopen = (event) => {
      attemptsRef.current = 0;
      setStatus("open");
      optionsRef.current.onOpen?.(event);
      if (heartbeatIntervalMs && heartbeatIntervalMs > 0) {
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, heartbeatIntervalMs);
      }
    };

    ws.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      setLastMessage(data);
      optionsRef.current.onMessage?.(event);
    };

    ws.onerror = (event) => {
      setStatus("error");
      optionsRef.current.onError?.(event);
    };

    ws.onclose = (event) => {
      setStatus("closed");
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      optionsRef.current.onClose?.(event);
      if (!manualCloseRef.current && reconnect && attemptsRef.current < maxReconnectAttempts) {
        attemptsRef.current += 1;
        setRetryCount((c) => c + 1);
      }
    };
  }, [enabled, url, protocols, reconnect, maxReconnectAttempts, heartbeatIntervalMs, query]);

  React.useEffect(() => {
    if (retryCount === 0) return;
    const timer = setTimeout(() => connect(), reconnectDelayMs);
    return () => clearTimeout(timer);
  }, [retryCount, reconnectDelayMs, connect]);

  React.useEffect(() => {
    const timer = setTimeout(() => connect(), 0);
    return () => {
      clearTimeout(timer);
      manualCloseRef.current = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close(1000, "component unmount");
      socketRef.current = null;
    };
  }, [connect]);

  const send = React.useCallback((data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data as string | Blob | BufferSource);
      return true;
    }
    return false;
  }, []);

  const sendJson = React.useCallback((payload: unknown): boolean => {
    try {
      return send(JSON.stringify(payload));
    } catch {
      return false;
    }
  }, [send]);

  const close = React.useCallback((code = 1000, reason = "") => {
    manualCloseRef.current = true;
    socketRef.current?.close(code, reason);
  }, []);

  const reconnectNow = React.useCallback(() => {
    manualCloseRef.current = true;
    socketRef.current?.close();
    attemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connect();
  }, [connect]);

  return { status, lastMessage, send, sendJson, close, reconnect: reconnectNow };
}

export type TerminalSocketOptions = Omit<UseSocketOptions, "onMessage"> & {
  onData?: (data: string) => void;
};

export interface TerminalSocketResult extends UseSocketResult {
  write: (chunk: string) => void;
}

export function useTerminalSocket({ onData, ...rest }: TerminalSocketOptions = {}): TerminalSocketResult {
  const onDataRef = React.useRef(onData);
  React.useEffect(() => {
    onDataRef.current = onData;
  });
  const socket = useSocket({
    ...rest,
    onMessage: (event) => {
      if (typeof event.data === "string") {
        onDataRef.current?.(event.data);
      }
    },
  });
  return { ...socket, write: socket.sendJson };
}
