import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { clientMessageSchema, type ServerMessage } from "../src/game/multiplayer/protocol";
import { verifyJoinTicket } from "../src/lib/multiplayer-ticket";
import type { Seat } from "../src/game/simulation/duel";
import { Rooms, type Room, type DuelResult } from "./rooms";

export function createRealtimeServer({ secret, onResult }: { secret: string; onResult: (result: DuelResult) => void }) {
  if (secret.length < 32) throw new Error("MULTIPLAYER_SECRET must contain at least 32 characters");
  const http = createServer((request, response) => {
    response.writeHead(request.url === "/health" ? 200 : 404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: request.url === "/health" }));
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const rooms = new Rooms(randomUUID(), randomUUID, onResult);
  const usedTickets = new Map<string, number>();
  type Connection = { id: string; room?: Room; seat?: Seat; alive: boolean; messages: number; window: number };
  const connections = new Map<WebSocket, Connection>();
  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 262144) { socket.terminate(); return; }
    socket.send(JSON.stringify(message));
  }
  http.on("upgrade", (request, socket, head) => {
    if (connections.size >= 1000 || !["/", "/multiplayer"].includes(request.url ?? "")) {
      socket.destroy(); return;
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
  async function close() {
    clearInterval(tick); clearInterval(heartbeat);
    for (const socket of connections.keys()) socket.terminate();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
    if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
  }
  return { http, close, rooms };
}
