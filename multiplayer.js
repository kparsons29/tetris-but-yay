(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const config = window.STACKLAB_CONFIG || {};
  let supabase = null, user = null, profile = null, socket = null, socketAuthed = false;
  let connecting = null, room = null, authMode = "signin", settingsTimer = null, applyingCloud = false;

  function showPage(id) {
    document.querySelectorAll(".page").forEach(page => page.classList.toggle("hidden", page.id !== id));
    $("siteHeader").classList.toggle("game-header", id === "gamePage");
    document.body.classList.toggle("in-game", id === "gamePage");
    $("appRoot").dataset.page = id;
    window.scrollTo(0, 0);
  }
  function db() {
    if (supabase) return supabase;
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return null;
    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabase;
  }
  function setText(id, value) { const node=$(id); if(node) node.textContent=String(value ?? ""); }
  function authStatus(message,error=false) {
    setText("authStatus",message);
    $("authStatus").classList.toggle("error",error);
  }
  function roomStatus(message,error=false) {
    setText("roomStatus",message);
    $("roomStatus").classList.toggle("error",error);
  }
  function setAuthMode(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    $("authUsernameField").classList.toggle("hidden",authMode !== "signup");
    $("authHeading").textContent = authMode === "signup" ? "CREATE ACCOUNT." : "SIGN IN.";
    $("authSubmit").textContent = authMode === "signup" ? "CREATE ACCOUNT →" : "SIGN IN →";
    $("authModeToggle").textContent = authMode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
    authStatus("");
  }
  async function loadProfile() {
    if(!user || !db()) return;
    const {data,error}=await supabase.from("profiles").select("username").eq("id",user.id).maybeSingle();
    profile=data || {username:user.user_metadata?.username || "Player"};
    if(error) console.warn("Profile lookup:",error.message);
    renderAccount();
  }
  function renderAccount() {
    const username=profile?.username || user?.user_metadata?.username || "Player";
    $("accountButton").textContent=user ? username.toUpperCase() : "SIGN IN";
    setText("accountStatus",user ? "SIGNED IN AS "+username : "NOT SIGNED IN");
    setText("accountUsername",user ? username : "Guest");
    setText("accountEmail",user?.email || "");
    $("accountSignOut").classList.toggle("hidden",!user);
  }
  async function saveCloudSettings(settings) {
    if(!user || !settings || !db()) return;
    const {error}=await supabase.from("player_settings").upsert({
      user_id:user.id,settings,updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    if(error) console.warn("Cloud settings were not saved:",error.message);
  }
  async function syncCloudSettings() {
    if(!user || !db() || !window.StackLabGame) return;
    const {data,error}=await supabase.from("player_settings").select("settings").eq("user_id",user.id).maybeSingle();
    if(error) { console.warn("Cloud settings could not be loaded:",error.message); return; }
    if(data?.settings && typeof data.settings==="object") {
      applyingCloud=true;
      try { window.StackLabGame.applySettingsBundle(data.settings); }
      finally { applyingCloud=false; }
    } else {
      await saveCloudSettings(window.StackLabGame.getSettingsBundle());
    }
  }
  window.addEventListener("stacklab:settings-changed",event=>{
    if(!user || applyingCloud) return;
    clearTimeout(settingsTimer);
    const settings=event.detail || window.StackLabGame?.getSettingsBundle();
    settingsTimer=setTimeout(()=>saveCloudSettings(settings),500);
  });
  async function applySession(session) {
    user=session?.user || null;
    if(!user) { profile=null; renderAccount(); return; }
    await loadProfile();
    await syncCloudSettings();
    renderAccount();
  }
  async function openAuth() {
    if(!db()) {
      showPage("authPage");
      setAuthMode("signin");
      authStatus("Add your Supabase project URL and anon/publishable key to stacklab-config.js first.",true);
      return;
    }
    showPage(user ? "accountPage" : "authPage");
    if(!user) setAuthMode(authMode);
  }

  async function connectSocket() {
    if(!user || !db()) throw new Error("Sign in before opening multiplayer.");
    if(socket?.readyState===WebSocket.OPEN && socketAuthed) return true;
    if(connecting) return connecting;
    if(!config.multiplayerUrl) throw new Error("Add your Railway WebSocket URL to stacklab-config.js first.");
    const {data}=await supabase.auth.getSession();
    const token=data?.session?.access_token;
    if(!token) throw new Error("Your sign-in session has expired. Sign in again.");
    connecting=new Promise((resolve,reject)=>{
      let settled=false;
      const endpoint=config.multiplayerUrl.replace(/\/$/,"").replace(/^http:/,"ws:").replace(/^https:/,"wss:");
      const url=endpoint.endsWith("/ws") ? endpoint : endpoint+"/ws";
      socket=new WebSocket(url);
      socketAuthed=false;
      const timer=setTimeout(()=>{
        if(!settled) { settled=true; reject(new Error("The multiplayer server did not respond. Check its Railway deployment.")); socket?.close(); }
      },10000);
      socket.addEventListener("open",()=>socket.send(JSON.stringify({type:"auth",token})));
      socket.addEventListener("message",event=>{
        let packet; try { packet=JSON.parse(event.data); } catch { return; }
        if(packet.type==="auth:ok") {
          socketAuthed=true;
          if(!settled) { settled=true; clearTimeout(timer); resolve(true); }
          send({type:"room:list"});
        } else if(packet.type==="auth:error") {
          if(!settled) { settled=true; clearTimeout(timer); reject(new Error(packet.message || "Authentication failed.")); }
          roomStatus(packet.message || "Sign in again to connect.",true);
        }
        handlePacket(packet);
      });
      socket.addEventListener("error",()=>{
        if(!settled) { settled=true; clearTimeout(timer); reject(new Error("Could not reach the multiplayer server.")); }
      });
      socket.addEventListener("close",()=>{
        socketAuthed=false;
        if(!settled) { settled=true; clearTimeout(timer); reject(new Error("The multiplayer connection closed.")); }
        if(room) roomStatus("Connection lost. Reopen Multiplayer to reconnect.",true);
      });
    }).finally(()=>{connecting=null;});
    return connecting;
  }
  function send(packet) {
    if(socket?.readyState===WebSocket.OPEN && socketAuthed) {
      socket.send(JSON.stringify(packet)); return true;
    }
    return false;
  }
  async function requireSocket(action) {
    try { await connectSocket(); action(); }
    catch(error) { roomStatus(error.message,true); setText("roomBrowserStatus",error.message); }
  }
  async function openMultiplayer() {
    if(!user) { showPage("authPage"); setAuthMode("signin"); return; }
    showPage("multiplayerPage");
    setText("roomBrowserStatus","CONNECTING TO MULTIPLAYER…");
    try { await connectSocket(); setText("roomBrowserStatus","PUBLIC ROOMS · LIVE"); send({type:"room:list"}); }
    catch(error) { setText("roomBrowserStatus",error.message); }
  }
  function renderRooms(rooms) {
    const container=$("roomList"); container.textContent="";
    if(!rooms.length) {
      const empty=document.createElement("div"); empty.className="room-empty";
      empty.textContent="No public rooms yet. Create one to start a match."; container.append(empty); return;
    }
    for(const item of rooms) {
      const row=document.createElement("article"); row.className="room-list-item";
      const details=document.createElement("div"); details.className="room-list-details";
      const name=document.createElement("strong"); name.textContent=item.name;
      const meta=document.createElement("span");
      meta.textContent=item.host+" · "+item.players+"/2 PLAYERS · "+item.spectators+" SPECTATORS · "+(item.phase==="playing"?"MATCH LIVE":"WAITING");
      details.append(name,meta);
      const button=document.createElement("button"); button.className="primary-button compact-button"; button.type="button";
      button.textContent=item.phase==="playing"?"SPECTATE":"JOIN";
      button.addEventListener("click",()=>send({type:"room:join",roomId:item.id}));
      row.append(details,button); container.append(row);
    }
  }
  function currentMember() { return room?.players?.find(member=>member.userId===user?.id) || null; }
  function renderRoom() {
    if(!room) return;
    setText("roomTitle",room.name); setText("roomCode",room.id);
    setText("roomPhaseLabel",room.phase==="playing"?"MATCH IN PROGRESS":room.phase==="results"?"MATCH COMPLETE":"WAITING FOR PLAYERS");
    const member=currentMember(), list=$("roomPlayers"); list.textContent="";
    for(const player of room.players || []) {
      const row=document.createElement("div"); row.className="room-player-row";
      const name=document.createElement("strong"); name.textContent=player.username+(player.isHost?" · HOST":"");
      const state=document.createElement("span");
      state.textContent=player.role==="playing"?(player.ready?"READY":"PLAYER SLOT"):"SPECTATING";
      if(player.ready) state.className="room-player-ready";
      row.append(name,state); list.append(row);
    }
    const active=(room.players || []).filter(item=>item.role==="playing").length;
    const spectators=(room.players || []).filter(item=>item.role==="spectating").length;
    setText("roomCapacity",active+"/2 PLAYER SLOTS · "+spectators+" SPECTATORS");
    $("roomReadyButton").disabled=!member || member.role!=="playing" || room.phase!=="waiting" || active!==2;
    $("roomReadyButton").textContent=member?.ready?"CANCEL READY":"READY UP";
    $("roomRoleButton").disabled=!member || room.phase!=="waiting";
    $("roomRoleButton").textContent=member?.role==="playing"?"SWITCH TO SPECTATING":"TAKE PLAYER SLOT";
    $("roomLeaveButton").disabled=room.phase==="playing";
    $("roomLeaveButton").classList.toggle("hidden",room.phase==="playing");
    $("roomResultNotice").classList.toggle("hidden",room.phase!=="results");
    if(room.countdownEndsAt && room.phase==="waiting") {
      const remaining=Math.max(0,Math.ceil((room.countdownEndsAt-Date.now())/1000));
      setText("roomCountdown",remaining>0?"MATCH STARTING IN "+remaining:"STARTING…");
      $("roomCountdown").classList.remove("hidden");
    } else { $("roomCountdown").classList.add("hidden"); setText("roomCountdown",""); }
  }
  function showResults(results) {
    window.StackLabGame?.stopOnlineMatch();
    setText("onlineWinner",results.winnerName+" WINS");
    const wrap=$("onlineResultPlayers"); wrap.textContent="";
    for(const player of results.players || []) {
      const card=document.createElement("article"); card.className="online-result-card";
      const heading=document.createElement("h3");
      heading.textContent=player.username+(player.userId===results.winnerId?" · WINNER":"");
      card.append(heading);
      for(const [label,value] of [["SCORE",player.stats?.score??0],["LINES",player.stats?.lines??0],
        ["PIECES",player.stats?.pieces??0],["ATTACK SENT",player.stats?.sent??0]]) {
        const metric=document.createElement("div"), key=document.createElement("span"), val=document.createElement("strong");
        key.textContent=label; val.textContent=Number(value).toLocaleString(); metric.append(key,val); card.append(metric);
      }
      wrap.append(card);
    }
    showPage("onlineResultsPage");
  }
  function handlePacket(packet) {
    switch(packet.type) {
      case "rooms:list": renderRooms(packet.rooms || []); break;
      case "room:state":
        room=packet.room;
        if (["multiplayerPage","homePage"].includes($("appRoot").dataset.page)) showPage("roomPage");
        renderRoom();
        break;
      case "room:left": room=null; showPage("multiplayerPage"); break;
      case "match:started": {
        const spectator=currentMember()?.role!=="playing";
        const match={...packet.match,localPlayerId:user.id,spectator};
        if(spectator) window.StackLabGame?.startOnlineSpectator(match);
        else window.StackLabGame?.startOnlineMatch(match);
        break;
      }
      case "match:board": window.StackLabGame?.applyOnlineSnapshot(packet.playerId,packet.state); break;
      case "match:attack":
        if(packet.targetId===user?.id) window.StackLabGame?.receiveOnlineAttack(packet.amount);
        break;
      case "match:results":
        if(room) room.phase="results";
        showResults(packet.results);
        break;
      case "error":
        if(!$("roomPage").classList.contains("hidden")) roomStatus(packet.message,true);
        else setText("roomBrowserStatus",packet.message);
        break;
    }
  }

  $("openMultiplayer").addEventListener("click",openMultiplayer);
  $("accountButton").addEventListener("click",openAuth);
  $("authBack").addEventListener("click",()=>showPage("homePage"));
  $("accountBack").addEventListener("click",()=>showPage("homePage"));
  $("authModeToggle").addEventListener("click",()=>setAuthMode(authMode==="signin"?"signup":"signin"));
  $("authForm").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!db()) { authStatus("Supabase is not configured yet. Add the project URL and anon key in stacklab-config.js.",true); return; }
    const email=$("authEmail").value.trim(), password=$("authPassword").value, username=$("authUsername").value.trim();
    if(authMode==="signup" && !/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      authStatus("Username must be 3–16 characters using letters, numbers or underscores.",true); return;
    }
    $("authSubmit").disabled=true;
    authStatus(authMode==="signup"?"CREATING ACCOUNT…":"SIGNING IN…");
    try {
      const result=authMode==="signup"
        ? await supabase.auth.signUp({email,password,options:{data:{username}}})
        : await supabase.auth.signInWithPassword({email,password});
      if(result.error) throw result.error;
      if(result.data.session) {
        await applySession(result.data.session); showPage("accountPage");
        authStatus(authMode==="signup"?"Account created. You're signed in.":"Signed in successfully.");
      } else authStatus("Check your email to confirm the account, then sign in here.");
    } catch(error) { authStatus(error.message || "Could not authenticate.",true); }
    finally { $("authSubmit").disabled=false; }
  });
  $("accountSignOut").addEventListener("click",async()=>{
    try { await supabase?.auth.signOut(); } catch {}
    socket?.close(); socket=null; socketAuthed=false; room=null; user=null; profile=null;
    renderAccount(); showPage("homePage");
  });
  $("createRoomButton").addEventListener("click",()=>{
    const name=$("newRoomName").value.trim();
    requireSocket(()=>send({type:"room:create",name}));
  });
  $("roomRefreshButton").addEventListener("click",()=>requireSocket(()=>send({type:"room:list"})));
  $("roomReadyButton").addEventListener("click",()=>{
    const member=currentMember(); if(member) send({type:"room:ready",ready:!member.ready});
  });
  $("roomRoleButton").addEventListener("click",()=>{
    const member=currentMember();
    if(member) send({type:"room:set-role",role:member.role==="playing"?"spectating":"playing"});
  });
  $("roomLeaveButton").addEventListener("click",()=>send({type:"room:leave"}));
  $("resultsReturnButton").addEventListener("click",()=>{
    send({type:"room:continue"});
    if(room) {
      room.phase="waiting"; room.countdownEndsAt=null;
      (room.players || []).forEach(member=>{member.ready=false;});
      renderRoom();
    }
    showPage("roomPage");
  });

  window.StackLabMultiplayer = {
    sendAttack:amount=>send({type:"match:attack",amount}),
    publishBoard:state=>{
      if(socket?.readyState!==WebSocket.OPEN || !socketAuthed || socket.bufferedAmount>65536) return false;
      return send({type:"match:board",state});
    },
    finishMatch:(stats,reason="top-out")=>send({type:"match:finish",stats,reason})
  };
  async function initialize() {
    renderAccount();
    if(!db()) { setAuthMode("signin"); setText("roomBrowserStatus","Multiplayer needs Supabase and Railway configuration."); return; }
    const {data}=await supabase.auth.getSession();
    await applySession(data?.session);
    supabase.auth.onAuthStateChange((_event,session)=>setTimeout(()=>applySession(session),0));
  }
  window.addEventListener("load",initialize);
})();
