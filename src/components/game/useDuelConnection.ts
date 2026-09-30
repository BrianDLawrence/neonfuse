"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DuelCommand } from "@/game/simulation/duel";
import type { ClientMessage, RoomSnapshot, ServerMessage } from "@/game/multiplayer/protocol";
import { fetchWithActivityRenewal, type ActivityAuth } from "@/lib/activity-session-renewal";
import { authenticatedHeaders } from "@/lib/authenticated-headers";

export function useDuelConnection(activityAuth: ActivityAuth | undefined) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const sequence = useRef(0);
  // Read auth at request time so a session renewal never re-runs the socket
  // effect: its cleanup sends "leave", which the server treats as a forfeit.
  const activityAuthRef = useRef(activityAuth);
  useEffect(() => { activityAuthRef.current = activityAuth; }, [activityAuth]);
  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let fatal = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let joinTimeout: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    async function connect() {
      if (cancelled) return;
      setStatus(snapshotRef.current ? "reconnecting" : "connecting");
      setError(null);
      try {
        // A 401 means the bearer session lapsed: renew once and retry before
        // treating it as fatal.
        const response = await fetchWithActivityRenewal(activityAuthRef.current, (token) =>
          fetch("/api/multiplayer/ticket", { method: "POST", headers: authenticatedHeaders(token), signal: abort.signal }));
        if (cancelled) return;
        const payload = await response.json() as { ticket?: string; error?: string };
        if (!response.ok || !payload.ticket) {
          fatal = true;
          throw new Error(payload.error ?? "Could not join the party.");
        }
        if (cancelled) return;
        // Discord maps /multiplayer to the dedicated realtime host. The direct
        // URL is only used by the normal browser/local development flow.
        const url = window.location.hostname.endsWith(".discordsays.com")
          ? `wss://${window.location.host}/multiplayer`
          : process.env.NEXT_PUBLIC_MULTIPLAYER_URL;
        if (!url) { fatal = true; throw new Error("Friend matches are not configured yet."); }
        const socket = new WebSocket(url);
        socketRef.current = socket;
        joinTimeout = setTimeout(() => socket.close(), 8000);
        socket.onopen = () => { if (!cancelled) socket.send(JSON.stringify({ type: "join", ticket: payload.ticket })); };
        socket.onmessage = (event) => {
          if (cancelled) return;
          try {
            const message = JSON.parse(event.data as string) as ServerMessage;
            if (message.type === "error") { fatal = message.fatal; setError(message.message); setStatus("error"); return; }
            if (message.type !== "state") throw new Error("Invalid server response");
            if (snapshotRef.current && message.serverId !== snapshotRef.current.serverId) {
              setNotice("The match server restarted. The previous round was abandoned. Ready up for a new match.");
            }
            clearTimeout(joinTimeout);
            snapshotRef.current = message;
            setSnapshot(message);
            setStatus("connected");
            failures = 0;
          } catch { fatal = true; setError("The game connection returned an invalid response."); setStatus("error"); socket.close(); }
        };
        socket.onclose = (event) => {
          clearTimeout(joinTimeout);
          if (cancelled || fatal) return;
          // 4009: a newer window or device took this seat. Not an error, but reconnecting
          // automatically would take it back and the two would trade the seat forever.
          if (event.code === 4009) { setError("Your match continued in another window or device."); setStatus("error"); return; }
          setStatus("reconnecting");
          retry = setTimeout(() => void connect(), Math.min(5000, 1000 * 2 ** failures++));
        };
        socket.onerror = () => socket.close();
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Unable to connect.");
        if (fatal) setStatus("error");
        else { setStatus("reconnecting"); retry = setTimeout(() => void connect(), Math.min(5000, 1000 * 2 ** failures++)); }
      }
    }
    void connect();
    return () => {
      cancelled = true;
      abort.abort();
      clearTimeout(retry);
      clearTimeout(joinTimeout);
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "leave" }));
      socket?.close();
      socketRef.current = null;
    };
  }, [attempt]);

  const input = useCallback((command: DuelCommand) => {
    const current = snapshotRef.current;
    if (!current || current.phase !== "playing") return;
    send({ type: "input", roundId: current.roundId, sequence: sequence.current++, command });
  }, [send]);
  return { snapshot, snapshotRef, status, error, notice, input,
    ready: (ready: boolean) => send({ type: "ready", ready }),
    retry: () => setAttempt((value) => value + 1) };
}
