/* Realtime provider: one authenticated WebSocket per session.
   Reconnects with backoff; exposes subscribe(type, handler). */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useApp } from "./AppContext";
import { LOCAL_MODE } from "../services/api";

const RtCtx = createContext(null);

export function RealtimeProvider({ children }) {
  const { user } = useApp();
  const [online, setOnline] = useState(false);
  const wsRef = useRef(null);
  const handlersRef = useRef(new Map());
  const retriesRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      // no session -> close any live socket
      if (wsRef.current) {
        closedRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      setOnline(false);
      return;
    }
    closedRef.current = false;
    if (LOCAL_MODE) {
      // No server, no live socket: the session is local to this device.
      setOnline(true);
      return undefined;
    }

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      // window.__API_BASE__: deploy-time placeholder rewritten by the hosting
      // proxy (see index.html). May be a relative proxy path -> resolve once
      // against the initial page URL; SPA routing must not affect it.
      const rawBase = window.__API_BASE__ || "";
      const unresolved = !rawBase || rawBase.startsWith("__PORT_");
      let base = `${proto}://${window.location.host}`;
      if (!unresolved) {
        const abs = /^(https?):\/\//.test(rawBase)
          ? rawBase
          : new URL(rawBase, document.baseURI).href;
        base = abs.replace(/^http/, "ws");
      }
      const ws = new WebSocket(`${base}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        setOnline(true);
      };
      ws.onmessage = (ev) => {
        let payload;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          return;
        }
        const hs = handlersRef.current.get(payload.type);
        if (hs) hs.forEach((h) => h(payload));
      };
      ws.onclose = () => {
        setOnline(false);
        if (!closedRef.current) {
          const delay = Math.min(30000, 1000 * 2 ** retriesRef.current);
          retriesRef.current += 1;
          setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closedRef.current = true;
      if (wsRef.current) wsRef.current.close();
    };
  }, [user]);

  const subscribe = useCallback((type, handler) => {
    if (!handlersRef.current.has(type)) handlersRef.current.set(type, new Set());
    handlersRef.current.get(type).add(handler);
    return () => handlersRef.current.get(type)?.delete(handler);
  }, []);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const value = useMemo(() => ({ online, subscribe, send }), [online, subscribe, send]);
  return <RtCtx.Provider value={value}>{children}</RtCtx.Provider>;
}

export function useRealtime() {
  return useContext(RtCtx);
}
