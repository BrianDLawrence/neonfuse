import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { clientMessageSchema, type ServerMessage } from "../src/game/multiplayer/protocol";
import { verifyJoinTicket } from "../src/lib/multiplayer-ticket";
import type { Seat } from "../src/game/simulation/duel";
import { Rooms, type Room, type DuelResult } from "./rooms";

export type PersistenceState = "connected" | "not-configured" | "unavailable";

type RealtimeServerOptions = {
  secret: string;
  onResult: (result: DuelResult) => void;
  maxConnections?: number;
  maxRooms?: number;
  dependencyHealth?: () => {
    persistence: PersistenceState;
    pendingResults: number;
  };
};

function positiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function createRealtimeServer({
  secret,
  onResult,
  maxConnections = 1000,
  maxRooms = 500,
  dependencyHealth = () => ({ persistence: "not-configured", pendingResults: 0 })
}: RealtimeServerOptions) {
  if (secret.length < 32) throw new Error("MULTIPLAYER_SECRET must contain at least 32 characters");
  positiveInteger(maxConnections, "maxConnections");
  positiveInteger(maxRooms, "maxRooms");
  const startedAt = Date.now();
  let draining = false;
  let closePromise: Promise<void> | undefined;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const rooms = new Rooms(randomUUID(), randomUUID, onResult, maxRooms);
  const usedTickets = new Map<string, number>();
  type Connection = { id: string; room?: Room; seat?: Seat; alive: boolean; messages: number; window: number };
  const connections = new Map<WebSocket, Connection>();
  const http = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/health") {
      response.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    const dependencies = dependencyHealth();
    const ok = !draining && dependencies.persistence !== "unavailable";
    const status = draining
      ? "draining"
      : dependencies.persistence === "unavailable"
        ? "unready"
        : dependencies.persistence === "not-configured"
          ? "degraded"
          : "ready";
    response.writeHead(ok ? 200 : 503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify({
      ok,
      service: "neon-fuse-realtime",
      status,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      checks: { persistence: dependencies.persistence },
      capacity: {
        connections: connections.size,
        maxConnections,
        rooms: rooms.rooms.size,
        maxRooms,
        pendingResults: dependencies.pendingResults
      }
    }));
  });
  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 262144) { socket.terminate(); return; }
    socket.send(JSON.stringify(message));
  }
  http.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!["/", "/multiplayer"].includes(path)) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (draining || connections.size >= maxConnections) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 5\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws));
  });
  sockets.on("connection", (socket) => {
    const connection: Connection = { id: randomUUID(), alive: true, messages: 0, window: Date.now() };
    connections.set(socket, connection);
    const authTimeout = setTimeout(() => { if (!connection.room) socket.close(4001, "Authentication required"); }, 5000);
    const lifetime = setTimeout(() => socket.close(4001, "Please renew your session"), 60 * 60 * 1000);
    socket.on("pong", () => { connection.alive = true; });
    socket.on("error", () => socket.terminate());
    socket.on("message", (raw, binary) => {
      const now = Date.now();
      if (now - connection.window >= 1000) { connection.messages = 0; connection.window = now; }
      if (++connection.messages > 40) { socket.close(4008, "Too many commands"); return; }
      try {
        const parsed = binary ? null : clientMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed?.success) { socket.close(4002, "Invalid command"); return; }
        const message = parsed.data;
        if (message.type === "join") {
          if (connection.room) { socket.close(4002, "Already joined"); return; }
          const ticket = verifyJoinTicket(message.ticket, secret, now);
          if (!ticket || usedTickets.has(ticket.nonce)) { socket.close(4001, "Invalid or expired ticket"); return; }
          usedTickets.set(ticket.nonce, ticket.expiresAt);
          const joined = rooms.join(ticket, connection.id, now);
          connection.room = joined.room;
          connection.seat = joined.seat;
          clearTimeout(authTimeout);
          send(socket, rooms.snapshot(joined.room, joined.seat, now));
        } else {
          if (!connection.room || connection.seat === undefined) { socket.close(4001, "Join first"); return; }
          rooms.message(connection.room, connection.seat, message, now);
          if (message.type === "leave") { socket.close(1000, "Left lobby"); return; }
        }
      } catch (error) {
        send(socket, { type: "error", message: error instanceof Error ? error.message : "Unable to join lobby", fatal: true });
        socket.close(4003, "Unable to join");
      }
    });
    socket.on("close", () => {
      clearTimeout(authTimeout); clearTimeout(lifetime);
      if (connection.room && connection.seat !== undefined && connection.room.members[connection.seat]?.connection === connection.id) {
        rooms.disconnect(connection.room, connection.seat, Date.now());
      }
      connections.delete(socket);
    });
  });
  const tick = setInterval(() => {
    const now = Date.now();
    rooms.tick(now);
    for (const [socket, connection] of connections) {
      if (connection.room && connection.seat !== undefined) send(socket, rooms.snapshot(connection.room, connection.seat, now));
    }
    for (const [nonce, expires] of usedTickets) if (expires <= now) usedTickets.delete(nonce);
  }, 50);
  const heartbeat = setInterval(() => {
    for (const [socket, connection] of connections) {
      if (!connection.alive) { socket.terminate(); continue; }
      connection.alive = false;
      socket.ping();
    }
  }, 5000);
  async function close({ graceMs = 0 }: { graceMs?: number } = {}) {
    if (closePromise) return closePromise;
    draining = true;
    closePromise = (async () => {
      clearInterval(tick); clearInterval(heartbeat);
      for (const socket of connections.keys()) socket.close(1012, "Service restarting");
      if (connections.size && graceMs > 0) {
        await Promise.race([
          new Promise<void>((resolve) => sockets.once("close", resolve)),
          new Promise<void>((resolve) => setTimeout(resolve, graceMs))
        ]);
      }
      for (const socket of connections.keys()) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
    })();
    return closePromise;
  }
  return { http, close, rooms };
}
