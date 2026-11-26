import test from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../room-manager.js";

function setup() {
  const sent = new Map();
  const manager = new RoomManager({ send(client, packet) {
    const list = sent.get(client.userId) || [];
    list.push(packet); sent.set(client.userId, list);
  }});
  const clients = ["alpha","bravo","charlie","delta"].map(id => ({ userId:id, username:id, roomId:null }));
  clients.forEach(client => manager.attach(client));
  const act = (client, packet) => manager.handle(client, packet);
  const last = (id, type) => (sent.get(id) || []).filter(packet => packet.type === type).at(-1);
  return { manager, clients, act, last };
}

test("first two players play and later members spectate", async () => {
  const {clients, act, last} = setup();
  await act(clients[0], {type:"room:create",name:"Test"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[2], {type:"room:join",roomId:id});
  assert.deepEqual(last("charlie","room:state").room.players.map(p => p.role), ["playing","playing","spectating"]);
});

test("oldest spectator is promoted when a waiting player leaves", async () => {
  const {manager,clients,act,last} = setup();
  await act(clients[0], {type:"room:create"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[2], {type:"room:join",roomId:id});
  await act(clients[1], {type:"room:leave"});
  assert.equal(manager.rooms.get(id).members.get("charlie").role,"playing");
});

test("voluntary switch to spectating promotes a different waiting spectator", async () => {
  const {manager,clients,act,last} = setup();
  await act(clients[0], {type:"room:create"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[2], {type:"room:join",roomId:id});
  await act(clients[3], {type:"room:join",roomId:id});
  await act(clients[0], {type:"room:set-role",role:"spectating"});
  const members = manager.rooms.get(id).members;
  assert.equal(members.get("alpha").role,"spectating");
  assert.equal(members.get("charlie").role,"playing");
  assert.equal(members.get("delta").role,"spectating");
});

test("cancelling ready clears the countdown without clearing the other player's ready state", async () => {
  const {manager,clients,act,last} = setup();
  await act(clients[0], {type:"room:create"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[0], {type:"room:ready",ready:true});
  await act(clients[1], {type:"room:ready",ready:true});
  assert.ok(manager.rooms.get(id).countdownTimer);
  await act(clients[0], {type:"room:ready",ready:false});
  const room = manager.rooms.get(id);
  assert.equal(room.countdownTimer,null);
  assert.equal(room.countdownEndsAt,null);
  assert.equal(room.members.get("alpha").ready,false);
  assert.equal(room.members.get("bravo").ready,true);
});

test("both player slots must ready before countdown starts", async () => {
  const {manager,clients,act,last} = setup();
  await act(clients[0], {type:"room:create"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[0], {type:"room:ready",ready:true});
  assert.equal(last("alpha","room:state").room.countdownEndsAt,null);
  await act(clients[1], {type:"room:ready",ready:true});
  assert.ok(last("alpha","room:state").room.countdownEndsAt);
  clearTimeout(manager.rooms.get(id).countdownTimer);
});

test("spectators cannot take a third player slot", async () => {
  const {clients,act,last} = setup();
  await act(clients[0], {type:"room:create"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[2], {type:"room:join",roomId:id});
  await act(clients[2], {type:"room:set-role",role:"playing"});
  assert.match(last("charlie","error").message,/already taken/);
});

test("spectators cannot submit attack packets", async () => {
  const {manager,clients,act,last} = setup();
  await act(clients[0], {type:"room:create"});
  const id = last("alpha","room:state").room.id;
  await act(clients[1], {type:"room:join",roomId:id});
  await act(clients[2], {type:"room:join",roomId:id});
  const room=manager.rooms.get(id);
  room.phase="playing";
  room.matchPlayers=[{userId:"alpha",username:"alpha"},{userId:"bravo",username:"bravo"}];
  await act(clients[2], {type:"match:attack",amount:4});
  assert.equal(last("alpha","match:attack"),undefined);
});
