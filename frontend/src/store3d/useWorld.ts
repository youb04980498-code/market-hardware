import { useCallback, useEffect, useRef, useState } from "react";
import { getTokens, request } from "../api/client";
import { parseSse } from "./worldModel";
import type { StreamState, WorldSnapshot } from "./worldModel";

export function useWorld() {
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [stream, setStream] = useState<StreamState | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true,
      inFlight = false,
      dirty = false;
    const controller = new AbortController();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let streamController: AbortController | undefined;
    function offline() {
      streamController?.abort();
      if (active) {
        setConnection("disconnected");
        setError("Browser offline. Retained data may be stale.");
      }
    }
    window.addEventListener("offline", offline);
    async function refresh() {
      if (inFlight) {
        dirty = true;
        return;
      }
      inFlight = true;
      try {
        const value = await request<WorldSnapshot>("/api/world/snapshot", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        });
        if (active) {
          setSnapshot(value);
          setError("");
        }
      } catch {
        if (active)
          setError("Live snapshot unavailable. Retained data may be stale.");
      } finally {
        inFlight = false;
        if (dirty && active) {
          dirty = false;
          void refresh();
        }
      }
    }
    function reconcile() {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 400);
    }
    refreshRef.current = () => void refresh();
    void refresh();
    const periodic = setInterval(() => void refresh(), 15000);
    async function connect() {
      let delay = 1000;
      while (active) {
        if (!navigator.onLine) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        try {
          // Existing request helper rotates expired tokens. No bearer token is placed in a URL.
          await request("/api/auth/me", {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          });
          const token = getTokens()?.access_token;
          if (!token) throw new Error("No active session");
          const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
            /\/$/,
            "",
          );
          streamController = new AbortController();
          const streamSignal = AbortSignal.any([
            controller.signal,
            streamController.signal,
          ]);
          const armWatchdog = () => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => streamController?.abort(), 25000);
          };
          armWatchdog();
          const response = await fetch(base + "/api/world/events", {
            headers: { Authorization: "Bearer " + token },
            signal: streamSignal,
            credentials: "include",
          });
          if (!response.ok || !response.body)
            throw new Error("Stream unavailable");
          if (active) setConnection("connected");
          delay = 1000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (active) {
              const chunk = await reader.read();
              if (chunk.done) break;
              armWatchdog();
              buffer += decoder
                .decode(chunk.value, { stream: true })
                .replace(/\r\n/g, "\n");
              if (buffer.length > 65536)
                throw new Error("Oversized stream frame");
              let end;
              while ((end = buffer.indexOf("\n\n")) >= 0) {
                const parsed = parseSse(buffer.slice(0, end));
                buffer = buffer.slice(end + 2);
                if (!parsed) continue;
                if (parsed.event === "auth-required")
                  throw new Error("Session must be checked again");
                if (active) setStream(parsed.data);
                if (parsed.event === "resync" || parsed.event === "invalidate")
                  reconcile();
              }
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
        } catch {
          /* retain HTTP snapshot, explicitly mark disconnection */
        } finally {
          clearTimeout(watchdog);
        }
        if (active) {
          setConnection("disconnected");
          reconcile();
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(delay * 2, 15000);
        }
      }
    }
    void connect();
    return () => {
      active = false;
      controller.abort();
      streamController?.abort();
      window.removeEventListener("offline", offline);
      clearTimeout(debounce);
      clearInterval(periodic);
    };
  }, []);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { snapshot, error, connection, stream, refresh };
}
