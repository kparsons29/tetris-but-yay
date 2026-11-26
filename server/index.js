import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "./room-manager.js";

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origins = (process.env.FRONTEND_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean);
if (!SUPABASE_URL || !ANON) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY in Railway Variables.");
  process.exit(1);
}
const authClient = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const admin = SERVICE ? createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } }) : null;

function send(client, packet) {
  if (client?.socket?.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(packet));
}
async function persistResult(room, result) {
  if (!admin) return;
  const winner = result.players.find(player => player.userId === result.winnerId);
  const loser = result.players.find(player => player.userId === result.loserId);
  if (!winner || !loser) return;
  const { error } = await admin.from("match_results").insert({
    room_id: room.id, winner_id: winner.userId, loser_id: loser.userId,
    winner_username: winner.username, loser_username: loser.username,
    winner_stats: winner.stats || {}, loser_stats: loser.stats || {}
  });
  if (error) throw error;
}
const rooms = new RoomManager({ send, persistResult });
const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", service: "stacklab-multiplayer", now: new Date().toISOString() }));
  } else {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
server.on("upgrade", (request, socket, head) => {
  const path = new globalThis.URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/ws") return socket.destroy();
  const origin = request.headers.origin;
  if (origins.length && origin && !origins.includes(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
});
wss.on("connection", socket => {
  const client = { socket, authenticated: false, roomId: null, userId: null, username: "Player" };
  let authTimer = setTimeout(() => {
    send(client, { type: "auth:error", message: "Authenticate with a valid account session." });
    socket.close(4001, "Authentication required");
  }, 8000);
  socket.on("message", async raw => {
    let packet;
    try { packet = JSON.parse(raw.toString()); }
    catch { send(client, { type: "error", message: "Invalid message format." }); return; }
    if (!client.authenticated) {
      if (packet?.type !== "auth" || typeof packet.token !== "string" || packet.token.length > 8192) {
        send(client, { type: "auth:error", message: "Authenticate before using multiplayer." });
        socket.close(4001, "Authentication required");
        return;
      }
      try {
        const { data, error } = await authClient.auth.getUser(packet.token);
        if (error || !data?.user) throw new Error("Invalid session.");
        client.userId = data.user.id;
        const profileClient = createClient(URL, ANON, {
          global: { headers: { Authorization: "Bearer " + packet.token } },
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { data: profile, error: profileError } = await profileClient
          .from("profiles").select("username").eq("id", client.userId).maybeSingle();
        if (profileError) throw profileError;
        client.username = String(profile?.username || "Player").replace(/[^A-Za-z0-9_]/g, "").slice(0, 16) || "Player";
        client.authenticated = true;
        clearTimeout(authTimer);
        authTimer = null;
        rooms.attach(client);
      } catch (error) {
        send(client, { type: "auth:error", message: error.message || "Could not verify your session." });
        socket.close(4001, "Invalid session");
      }
      return;
    }
    await rooms.handle(client, packet);
  });
  socket.on("close", () => {
    if (authTimer) clearTimeout(authTimer);
    if (client.authenticated) rooms.disconnect(client);
  });
  socket.on("error", error => console.warn("WebSocket error:", error.message));
});
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
wss.on("connection", socket => {
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });
});
server.listen(PORT, "0.0.0.0", () => console.log("STACK//LAB multiplayer listening on " + PORT));
process.on("SIGTERM", () => {
  clearInterval(heartbeat);
  for (const socket of wss.clients) socket.close(1001, "Server shutting down");
  server.close(() => process.exit(0));
});
