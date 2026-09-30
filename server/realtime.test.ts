import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { createRealtimeServer } from "./realtime";
import { signJoinTicket } from "../src/lib/multiplayer-ticket";
import type { RoomSnapshot } from "../src/game/multiplayer/protocol";

const secret = "integration-test-secret-at-least-32-characters";
let server: ReturnType<typeof createRealtimeServer> | undefined;
afterEach(async () => { await server?.close(); });
async function start() {
  server = createRealtimeServer({ secret, onResult: () => undefined });
  await new Promise<void>((resolve) => server!.http.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/multiplayer`;
}
async function connect(url: string) {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return socket;
}
function nextState(socket: WebSocket, predicate: (state: RoomSnapshot) => boolean = () => true, timeoutMs = 2000) {
  return new Promise<RoomSnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", receive); reject(new Error("Timed out waiting for shared state")); }, timeoutMs);
    function receive(raw: import("ws").RawData) {
      const state = JSON.parse(raw.toString()) as RoomSnapshot;
      if (state.type === "state" && predicate(state)) { clearTimeout(timeout); socket.off("message", receive); resolve(state); }
    }
    socket.on("message", receive);
  });
}

describe("realtime transport", () => {
  it("connects two authenticated sockets to the same lobby and broadcasts a shared countdown", async () => {
    const url = await start();
    const a = await connect(url); const b = await connect(url);
    a.send(JSON.stringify({ type: "join", ticket: signJoinTicket({ playerId: "a", name: "Alice", roomId: "party" }, secret, Date.now()) }));
    await nextState(a);
    b.send(JSON.stringify({ type: "join", ticket: signJoinTicket({ playerId: "b", name: "Bob", roomId: "party" }, secret, Date.now()) }));
    const joined = await nextState(b);
    expect(joined.seat).toBe(1);
    expect(joined.players.map((player) => player?.name)).toEqual(["Alice", "Bob"]);
    a.send(JSON.stringify({ type: "ready", ready: true }));
    b.send(JSON.stringify({ type: "ready", ready: true }));
    const [one, two] = await Promise.all([nextState(a, (s) => s.phase === "countdown"), nextState(b, (s) => s.phase === "countdown")]);
    expect(one.roundId).toBe(two.roundId);
    expect(one.duel).toEqual(two.duel);
    a.close(); b.close();
  });
  it("hands a live seat to a newer connection during play and closes the old socket", async () => {
    const url = await start();
    const join = (socket: WebSocket, playerId: string) =>
      socket.send(JSON.stringify({ type: "join", ticket: signJoinTicket({ playerId, name: playerId, roomId: "party" }, secret, Date.now()) }));
    const a = await connect(url); const b = await connect(url);
    join(a, "a"); await nextState(a);
    join(b, "b"); await nextState(b);
    a.send(JSON.stringify({ type: "ready", ready: true }));
    b.send(JSON.stringify({ type: "ready", ready: true }));
    const playing = await nextState(b, (s) => s.phase === "playing", 5000);
    const oldClosed = new Promise<number>((resolve) => a.once("close", resolve));
    const replacement = await connect(url);
    join(replacement, "a");
    const resumed = await nextState(replacement);
    expect(resumed).toMatchObject({ seat: 0, roundId: playing.roundId, phase: "playing" });
    expect(await oldClosed).toBe(4009);
    // The old socket's close must not mark the new connection as disconnected.
    const after = await nextState(b, (s) => s.duel !== null && s.duel.time > resumed.duel!.time + 200);
    expect(after).toMatchObject({ phase: "playing", reconnectSeconds: null });
    expect(after.players.map((player) => player?.connected)).toEqual([true, true]);
    replacement.close(); b.close();
  }, 10000);
  it("rejects commands before authentication and prevents ticket replay", async () => {
    const url = await start();
    const unauthenticated = await connect(url);
    const closed = new Promise<number>((resolve) => unauthenticated.once("close", resolve));
    unauthenticated.send(JSON.stringify({ type: "ready", ready: true }));
    expect(await closed).toBe(4001);
    const ticket = signJoinTicket({ playerId: "a", name: "Alice", roomId: "party" }, secret, Date.now());
    const first = await connect(url);
    first.send(JSON.stringify({ type: "join", ticket }));
    await nextState(first);
    const replay = await connect(url);
    const replayClosed = new Promise<number>((resolve) => replay.once("close", resolve));
    replay.send(JSON.stringify({ type: "join", ticket }));
    expect(await replayClosed).toBe(4001);
    first.close();
  });
});
