import { randomUUID } from "node:crypto";

const TYPES = new Set(["I", "J", "L", "O", "S", "T", "Z"]);
const text = (value, max = 32) => typeof value === "string" ? value.trim().slice(0, max) : "";

function isSnapshotValid(s) {
  if (!s || typeof s !== "object" || !Array.isArray(s.board) || s.board.length !== 20) return false;
  if (!s.board.every(row => Array.isArray(row) && row.length === 10 &&
    row.every(cell => cell === null || cell === "G" || TYPES.has(cell)))) return false;
  if (!s.current || !TYPES.has(s.current.type) ||
      !Number.isInteger(s.current.x) || s.current.x < -4 || s.current.x > 10 ||
      !Number.isInteger(s.current.y) || s.current.y < -4 || s.current.y > 24 ||
      !Number.isInteger(s.current.rot) || s.current.rot < 0 || s.current.rot > 3) return false;
  if (s.hold !== null && !TYPES.has(s.hold)) return false;
  if (!Array.isArray(s.queue) || s.queue.length > 14 || !s.queue.every(type => TYPES.has(type))) return false;
  return ["score", "lines", "pieces", "sent", "incoming", "elapsed"].every(key =>
    Number.isFinite(s[key]) && s[key] >= 0 && s[key] <= 1_000_000_000);
}

function safeStats(value) {
  const input = value && typeof value === "object" ? value : {};
  const get = key => Math.max(0, Math.min(1_000_000_000, Number(input[key]) || 0));
  return { score: get("score"), lines: get("lines"), pieces: get("pieces"), sent: get("sent"), elapsed: get("elapsed") };
}

export class RoomManager {
  constructor({ send, persistResult = async () => {} }) {
    this.send = send;
    this.persistResult = persistResult;
    this.clients = new Set();
    this.rooms = new Map();
  }

  attach(client) {
    this.clients.add(client);
    this.send(client, { type: "auth:ok", user: { id: client.userId, username: client.username } });
    this.sendRooms(client);
  }

  async handle(client, packet) {
    if (!this.clients.has(client) || !packet || typeof packet !== "object" || typeof packet.type !== "string") return;
    switch (packet.type) {
      case "room:list": this.sendRooms(client); break;
      case "room:create": this.createRoom(client, packet.name); break;
      case "room:join": this.joinRoom(client, packet.roomId); break;
      case "room:leave": this.leaveRoom(client, "left"); break;
      case "room:set-role": this.setRole(client, packet.role); break;
      case "room:ready": this.setReady(client, packet.ready); break;
      case "room:continue": this.continueAfterResults(client); break;
      case "match:board": this.publishBoard(client, packet.state); break;
      case "match:attack": this.sendAttack(client, packet.amount); break;
      case "match:finish": await this.finishMatch(client, packet.stats, packet.reason); break;
      default: this.send(client, { type: "error", message: "Unknown multiplayer action." });
    }
  }

  disconnect(client) {
    this.leaveRoom(client, "disconnected");
    this.clients.delete(client);
  }

  sendRooms(client) {
    const rooms = [...this.rooms.values()]
      .filter(room => room.phase !== "results" && room.members.size < 12)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100)
      .map(room => ({
        id: room.id, name: room.name, host: room.hostName,
        players: [...room.members.values()].filter(member => member.role === "playing").length,
        spectators: [...room.members.values()].filter(member => member.role === "spectating").length,
        phase: room.phase
      }));
    this.send(client, { type: "rooms:list", rooms });
  }

  sendAllRooms() {
    for (const client of this.clients) this.sendRooms(client);
  }

  createRoom(client, requestedName) {
    if (client.roomId) return this.error(client, "Leave your current room first.");
    const id = randomUUID().slice(0, 8).toUpperCase();
    const room = {
      id, name: text(requestedName, 28) || (client.username + "'s room"),
      hostId: client.userId, hostName: client.username,
      members: new Map(), phase: "waiting", matchPlayers: [],
      snapshots: new Map(), stats: new Map(), results: null,
      countdownEndsAt: null, countdownTimer: null, updatedAt: Date.now()
    };
    this.rooms.set(id, room);
    this.addMember(room, client, "playing");
    this.roomChanged(room);
  }

  joinRoom(client, requestedId) {
    if (client.roomId) return this.error(client, "Leave your current room first.");
    const room = this.rooms.get(text(requestedId, 12).toUpperCase());
    if (!room || room.phase === "results") return this.error(client, "That room is no longer available.");
    if (room.members.size >= 12) return this.error(client, "That room is full.");
    const playing = [...room.members.values()].filter(member => member.role === "playing").length;
    this.addMember(room, client, room.phase === "waiting" && playing < 2 ? "playing" : "spectating");
    this.roomChanged(room);
    if (room.phase === "playing") {
      this.send(client, { type: "match:started", match: this.matchInfo(room) });
      for (const [playerId, state] of room.snapshots) this.send(client, { type: "match:board", playerId, state });
    }
  }

  addMember(room, client, role) {
    room.members.set(client.userId, {
      userId: client.userId, username: client.username, role, ready: false, joinedAt: Date.now()
    });
    client.roomId = room.id;
    room.updatedAt = Date.now();
  }

  setRole(client, role) {
    const room = this.roomFor(client);
    if (!room) return;
    if (room.phase !== "waiting") return this.error(client, "Roles are locked once a match starts.");
    if (!["playing", "spectating"].includes(role)) return;
    const member = room.members.get(client.userId);
    if (!member || member.role === role) return;
    const playing = [...room.members.values()].filter(item => item.role === "playing").length;
    if (role === "playing" && playing >= 2) return this.error(client, "Both player slots are already taken.");
    member.role = role;
    member.ready = false;
    if (role === "spectating") this.promoteWaitingSpectator(room);
    this.resetReady(room);
    this.roomChanged(room);
  }

  promoteWaitingSpectator(room) {
    if ([...room.members.values()].filter(member => member.role === "playing").length >= 2) return;
    const next = [...room.members.values()]
      .filter(member => member.role === "spectating")
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) { next.role = "playing"; next.ready = false; }
  }

  setReady(client, ready) {
    const room = this.roomFor(client);
    if (!room || room.phase !== "waiting") return;
    const member = room.members.get(client.userId);
    if (!member || member.role !== "playing") return this.error(client, "Only active players can ready up.");
    member.ready = Boolean(ready);
    const players = [...room.members.values()].filter(item => item.role === "playing");
    this.roomChanged(room);
    if (players.length === 2 && players.every(item => item.ready)) this.beginCountdown(room);
  }

  beginCountdown(room) {
    if (room.countdownTimer || room.phase !== "waiting") return;
    room.countdownEndsAt = Date.now() + 3000;
    this.sendRoomState(room);
    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      const players = [...room.members.values()].filter(member => member.role === "playing");
      if (room.phase !== "waiting" || players.length !== 2 || !players.every(member => member.ready)) {
        room.countdownEndsAt = null;
        this.sendRoomState(room);
        return;
      }
      this.startMatch(room, players);
    }, 3000);
    room.countdownTimer.unref?.();
  }

  startMatch(room, players) {
    room.phase = "playing";
    room.countdownEndsAt = null;
    room.snapshots.clear();
    room.stats.clear();
    room.results = null;
    const order = players.slice();
    if (order.some(member => member.userId === room.hostId)) {
      order.sort((a, b) => Number(b.userId === room.hostId) - Number(a.userId === room.hostId));
    } else if (Math.random() < 0.5) order.reverse();
    room.matchPlayers = order.map(member => ({ userId: member.userId, username: member.username }));
    room.updatedAt = Date.now();
    this.broadcastRoom(room, { type: "match:started", match: this.matchInfo(room) });
    this.roomChanged(room);
  }

  matchInfo(room) {
    return { roomId: room.id, hostId: room.hostId, players: room.matchPlayers, startedAt: room.updatedAt };
  }

  publishBoard(client, state) {
    const room = this.roomFor(client);
    const member = room?.members.get(client.userId);
    if (!room || room.phase !== "playing" || member?.role !== "playing") return;
    const now = Date.now();
    if (now - (client.lastBoardAt || 0) < 70 || !isSnapshotValid(state)) return;
    client.lastBoardAt = now;
    const safe = {
      board: state.board,
      current: { type: state.current.type, x: state.current.x, y: state.current.y, rot: state.current.rot },
      hold: state.hold, queue: state.queue.slice(0, 8),
      score: Math.floor(state.score), lines: Math.floor(state.lines),
      pieces: Math.floor(state.pieces), sent: Math.floor(state.sent),
      incoming: Math.floor(state.incoming), elapsed: Math.floor(state.elapsed),
      alive: state.alive !== false
    };
    room.snapshots.set(client.userId, safe);
    room.stats.set(client.userId, safeStats(safe));
    this.broadcastRoom(room, { type: "match:board", playerId: client.userId, state: safe });
  }

  sendAttack(client, amount) {
    const room = this.roomFor(client);
    const member = room?.members.get(client.userId);
    if (!room || room.phase !== "playing" || member?.role !== "playing") return;
    const value = Number(amount);
    const now = Date.now();
    if (!Number.isInteger(value) || value < 1 || value > 20 || now - (client.lastAttackAt || 0) < 180) return;
    client.lastAttackAt = now;
    const opponent = room.matchPlayers.find(player => player.userId !== client.userId);
    if (opponent) this.broadcastRoom(room, {
      type: "match:attack", fromId: client.userId, targetId: opponent.userId, amount: value
    });
  }

  async finishMatch(client, rawStats, reason) {
    const room = this.roomFor(client);
    const member = room?.members.get(client.userId);
    if (!room || room.phase !== "playing" || member?.role !== "playing") return;
    const loser = room.matchPlayers.find(player => player.userId === client.userId);
    const winner = room.matchPlayers.find(player => player.userId !== client.userId);
    if (!loser || !winner) return;
    room.stats.set(client.userId, safeStats(rawStats));
    this.completeMatch(room, winner, loser, reason);
    try { await this.persistResult(room, room.results); }
    catch (error) { console.error("Could not save match result:", error?.message || error); }
  }

  completeMatch(room, winner, loser, reason) {
    if (room.phase !== "playing") return;
    room.phase = "results";
    room.results = {
      winnerId: winner.userId, winnerName: winner.username,
      loserId: loser.userId, loserName: loser.username,
      reason: text(reason, 80) || "top-out",
      players: room.matchPlayers.map(player => ({
        ...player, stats: room.stats.get(player.userId) || safeStats({})
      })),
      endedAt: Date.now()
    };
    room.updatedAt = Date.now();
    this.broadcastRoom(room, { type: "match:results", results: room.results });
    this.sendRoomState(room);
    this.sendAllRooms();
  }

  continueAfterResults(client) {
    const room = this.roomFor(client);
    if (!room || room.phase !== "results") return;
    room.phase = "waiting";
    room.results = null;
    room.matchPlayers = [];
    room.snapshots.clear();
    room.stats.clear();
    for (const member of room.members.values()) member.ready = false;
    this.promoteWaitingSpectator(room);
    this.roomChanged(room);
  }

  leaveRoom(client, reason = "left") {
    const room = this.roomFor(client);
    if (!room) return;
    const member = room.members.get(client.userId);
    if (member && room.phase === "playing" && member.role === "playing") {
      const winner = room.matchPlayers.find(player => player.userId !== client.userId);
      const loser = room.matchPlayers.find(player => player.userId === client.userId);
      if (winner && loser) this.completeMatch(room, winner, loser, reason === "disconnected" ? "disconnect" : "forfeit");
    }
    room.members.delete(client.userId);
    client.roomId = null;
    if (room.hostId === client.userId) {
      const nextHost = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      room.hostId = nextHost?.userId || null;
      room.hostName = nextHost?.username || "";
    }
    if (room.members.size === 0) {
      clearTimeout(room.countdownTimer);
      this.rooms.delete(room.id);
    } else {
      if (room.phase === "waiting") {
        this.promoteWaitingSpectator(room);
        this.resetReady(room);
      }
      this.roomChanged(room);
    }
    this.send(client, { type: "room:left", reason });
    this.sendAllRooms();
  }

  resetReady(room) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
    room.countdownEndsAt = null;
    for (const member of room.members.values()) member.ready = false;
  }

  roomFor(client) { return client.roomId ? this.rooms.get(client.roomId) : null; }
  error(client, message) { this.send(client, { type: "error", message }); }
  roomChanged(room) { room.updatedAt = Date.now(); this.sendRoomState(room); this.sendAllRooms(); }

  roomState(room) {
    return {
      id: room.id, name: room.name, hostId: room.hostId, hostName: room.hostName,
      phase: room.phase, countdownEndsAt: room.countdownEndsAt, results: room.results,
      players: [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt).map(member => ({
        userId: member.userId, username: member.username, role: member.role,
        ready: member.ready, isHost: member.userId === room.hostId
      }))
    };
  }

  sendRoomState(room) { this.broadcastRoom(room, { type: "room:state", room: this.roomState(room) }); }
  broadcastRoom(room, packet) {
    for (const client of this.clients) if (client.roomId === room.id) this.send(client, packet);
  }
}
