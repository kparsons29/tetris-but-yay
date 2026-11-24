/* STACK//LAB — browser-only versus stacker */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const W = 10, H = 20, CELL = 30;
  const COLORS = {
    I: "#45d8d0", J: "#568dff", L: "#ffab68", O: "#f5d66b",
    S: "#76d98c", T: "#b38cff", Z: "#ff718b", G: "#68778d"
  };
  const BASE = {
    I: { size: 4, cells: [[0,1],[1,1],[2,1],[3,1]] },
    J: { size: 3, cells: [[0,0],[0,1],[1,1],[2,1]] },
    L: { size: 3, cells: [[2,0],[0,1],[1,1],[2,1]] },
    O: { size: 2, cells: [[0,0],[1,0],[0,1],[1,1]] },
    S: { size: 3, cells: [[1,0],[2,0],[0,1],[1,1]] },
    T: { size: 3, cells: [[1,0],[0,1],[1,1],[2,1]] },
    Z: { size: 3, cells: [[0,0],[1,0],[1,1],[2,1]] }
  };
  const TYPES = Object.keys(BASE);
  const rotateCells = (cells, size) => cells.map(([x,y]) => [size - 1 - y, x]);
  const SHAPES = {};
  TYPES.forEach((type) => {
    SHAPES[type] = [BASE[type].cells];
    for (let r = 1; r < 4; r++) SHAPES[type].push(rotateCells(SHAPES[type][r - 1], BASE[type].size));
  });

  // Kick offsets are in board coordinates: +x right, +y down.
  const JL = {
    "0>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "1>0": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "1>2": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "2>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "2>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "3>2": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "3>0": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "0>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]]
  };
  // TETR.IO-style SRS+: the I-piece's five tests are mirrored and
  // symmetric across the vertical axis, rather than standard I-SRS.
  const IK = {
    "0>1": [[0,0],[1,0],[-2,0],[-2,1],[1,-2]],
    "1>0": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    "1>2": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    "2>1": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "2>3": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    "3>2": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "3>0": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    "0>3": [[0,0],[-1,0],[2,0],[2,1],[-1,-2]]
  };
  // Extended 180-degree tests: a deliberate 180 kick set, not two blind
  // quarter-turns. The ordering favours neutral and low-profile tucks.
  const K180_MAIN = [[0,0],[0,-1],[1,0],[-1,0],[0,1],[1,-1],[-1,-1],[2,0],[-2,0],[0,-2],[1,1],[-1,1]];
  const K180_I = [[0,0],[1,0],[-1,0],[2,0],[-2,0],[0,-1],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]];

  const makeBoard = () => Array.from({ length: H }, () => Array(W).fill(null));
  const emptyBag = () => {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  };
  const newQueue = () => emptyBag().concat(emptyBag());
  const makePiece = (type) => ({
    type, x: Math.floor((W - BASE[type].size) / 2), y: 0, rot: 0,
    lastRotate: false, kick: 0, lastAction: "spawn"
  });
  const cloneBoard = (board) => board.map((row) => row.slice());
  const clonePiece = (p) => ({ ...p });
  const cellsOf = (piece, x, y, rot) =>
    SHAPES[piece.type][rot].map(([cx,cy]) => [x + cx, y + cy]);

  function collides(board, piece, x = piece.x, y = piece.y, rot = piece.rot) {
    const shape = SHAPES[piece.type][rot];
    for (const [cx,cy] of shape) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= W || by >= H) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
    return false;
  }
  function ghostY(board, piece) {
    let y = piece.y;
    while (!collides(board, piece, piece.x, y + 1, piece.rot)) y++;
    return y;
  }
  function mergePiece(board, piece) {
    for (const [x,y] of cellsOf(piece, piece.x, piece.y, piece.rot)) {
      if (y < 0) return false;
      board[y][x] = piece.type;
    }
    return true;
  }
  function clearLines(board) {
    let count = 0;
    for (let y = H - 1; y >= 0; y--) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(W).fill(null));
        count++;
        y++;
      }
    }
    return count;
  }

  const defaultSettings = { das: 120, arr: 20, sdf: 10, dasCancel: false };
  let settings = { ...defaultSettings };
  try {
    const saved = JSON.parse(localStorage.getItem("stacklab-settings") || "{}");
    settings = { ...settings, ...saved };
  } catch (_) { /* ignore malformed local settings */ }

  const defaultKeybinds = {
    left: "ArrowLeft", right: "ArrowRight", down: "ArrowDown",
    hardDrop: "Space", rotateCCW: "KeyZ", rotateCW: "KeyX",
    rotate180: "KeyA", hold: "KeyC", pause: "KeyP",
    restart: "KeyR", start: "Enter"
  };
  const keybindActions = [
    ["left", "Move left"], ["right", "Move right"], ["down", "Soft drop"],
    ["hardDrop", "Hard drop"], ["rotateCCW", "Rotate counter-clockwise"],
    ["rotateCW", "Rotate clockwise"], ["rotate180", "Rotate 180°"],
    ["hold", "Hold piece"], ["pause", "Pause / resume"],
    ["restart", "Restart match"], ["start", "Start / play again"]
  ];
  let keybinds = { ...defaultKeybinds };
  let captureAction = null;
  try {
    const saved = JSON.parse(localStorage.getItem("stacklab-keybinds") || "{}");
    const used = new Set();
    for (const action of Object.keys(defaultKeybinds)) {
      const value = saved[action];
      if (typeof value === "string" && isBindableCode(value) && !used.has(value)) {
        keybinds[action] = value;
        used.add(value);
      }
    }
  } catch (_) { /* ignore malformed saved bindings */ }

  function isBindableCode(code) {
    if (["Space","Enter","ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
      "Home","End","PageUp","PageDown","Insert","NumpadEnter",
      "NumpadAdd","NumpadSubtract","NumpadMultiply","NumpadDivide","NumpadDecimal"].includes(code)) return true;
    return /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code) ||
      /^(Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(code);
  }
  function keyLabel(code) {
    const labels = {
      ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
      Space: "SPACE", Enter: "ENTER", Home: "HOME", End: "END",
      PageUp: "PG UP", PageDown: "PG DN", Insert: "INSERT",
      NumpadEnter: "NUM ENTER", NumpadAdd: "NUM +", NumpadSubtract: "NUM −",
      NumpadMultiply: "NUM *", NumpadDivide: "NUM /", NumpadDecimal: "NUM .",
      Backquote: "`", Minus: "−", Equal: "=", BracketLeft: "[",
      BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
      Comma: ",", Period: ".", Slash: "/"
    };
    if (labels[code]) return labels[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad") && /^Numpad[0-9]$/.test(code)) return "NUM " + code.slice(6);
    return code.toUpperCase();
  }
  function saveKeybinds() {
    try { localStorage.setItem("stacklab-keybinds", JSON.stringify(keybinds)); } catch (_) {}
    renderKeybinds();
  }
  function renderKeybinds() {
    const rows = $("keybindRows");
    if (rows) {
      rows.textContent = "";
      for (const [action, label] of keybindActions) {
        const item = document.createElement("div");
        item.className = "keybind-item";
        const name = document.createElement("span");
        name.textContent = label;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "keybind-button" + (captureAction === action ? " capturing" : "");
        button.dataset.bindAction = action;
        button.textContent = captureAction === action ? "PRESS A KEY…" : keyLabel(keybinds[action]);
        button.setAttribute("aria-label", "Change " + label + " key, currently " + keyLabel(keybinds[action]));
        button.addEventListener("click", () => beginKeyCapture(action));
        item.append(name, button);
        rows.append(item);
      }
    }
    const displayIds = {
      left: "display-left", right: "display-right", down: "display-down",
      hardDrop: "display-hardDrop", rotateCCW: "display-rotateCCW",
      rotateCW: "display-rotateCW", rotate180: "display-rotate180",
      hold: "display-hold", pause: "display-pause",
      restart: "display-restart", start: "display-start"
    };
    for (const [action, id] of Object.entries(displayIds)) {
      const el = $(id);
      if (el) el.textContent = keyLabel(keybinds[action]);
    }
  }
  function clearHeldControls() {
    held.clear();
    shift.dir = 0;
    shift.elapsed = 0;
    shift.repeat = 0;
    shift.instantDone = false;
  }
  function beginKeyCapture(action) {
    captureAction = action;
    clearHeldControls();
    $("keybindStatus").textContent = "Press a key for " + keybindActions.find(([id]) => id === action)[1] + ". Escape cancels.";
    renderKeybinds();
  }
  function closeKeybindEditor() {
    captureAction = null;
    clearHeldControls();
    $("keybindModal").classList.add("hidden");
  }
  function assignCapturedKey(code) {
    if (!captureAction) return;
    if (!isBindableCode(code)) {
      $("keybindStatus").textContent = "That key cannot be assigned. Try a letter, number, arrow, or Space.";
      return;
    }
    const action = captureAction;
    const previous = keybinds[action];
    const conflict = Object.keys(keybinds).find((name) => name !== action && keybinds[name] === code);
    keybinds[action] = code;
    if (conflict) keybinds[conflict] = previous;
    captureAction = null;
    saveKeybinds();
    const actionLabel = keybindActions.find(([id]) => id === action)[1];
    const message = conflict
      ? "Swapped " + actionLabel + " with " + keybindActions.find(([id]) => id === conflict)[1] + "."
      : actionLabel + " set to " + keyLabel(code) + ".";
    $("keybindStatus").textContent = message + " Changes save automatically.";
  }
  function openKeybindEditor() {
    captureAction = null;
    clearHeldControls();
    $("keybindStatus").textContent = "Select an action, then press the key you want to use.";
    $("keybindModal").classList.remove("hidden");
    renderKeybinds();
    const first = $("keybindRows").querySelector("button");
    if (first) first.focus();
  }

  let player = null;
  let bots = [];
  let started = false, paused = false, ended = false;
  let lastFrame = 0, gravityClock = 0, softClock = 0, lockClock = 0, lockResets = 0;
  let shift = { dir: 0, elapsed: 0, repeat: 0, instantDone: false };
  let held = new Set();
  let particles = [];
  let lineFlash = 0;
  let shake = 0;
  let lastUiAt = 0;
  let apmWindow = [];
  let targetCursor = 0;

  function createPlayer() {
    const queue = newQueue();
    const p = {
      board: makeBoard(), queue, current: null, hold: null, holdUsed: false,
      score: 0, lines: 0, level: 1, combo: -1, b2b: 0, incoming: [],
      incomingClock: 900, alive: true, pieces: 0, sent: 0, spin: "—",
      lastMove: "—", lastRotate: false, attackFlash: 0
    };
    p.current = takeNext(p);
    return p;
  }
  function takeNext(state) {
    if (state.queue.length < 7) state.queue.push(...emptyBag());
    return makePiece(state.queue.shift());
  }
  function createBot(index, name, difficulty, pace) {
    const state = {
      index, name, difficulty, pace, clock: 500 + Math.random() * 400,
      board: makeBoard(), queue: newQueue(), current: null, combo: -1, b2b: 0,
      incoming: [], incomingClock: 1000, lines: 0, sent: 0, alive: true,
      pieces: 0, score: 0
    };
    state.current = takeNext(state);
    return state;
  }
  function resetMatch(autostart) {
    player = createPlayer();
    bots = [
      createBot(0, "PIXEL", "CASUAL", 1320),
      createBot(1, "GLITCH", "STANDARD", 920),
      createBot(2, "OVERDRIVE", "EXPERT", 680)
    ];
    started = Boolean(autostart);
    paused = false;
    ended = false;
    gravityClock = softClock = lockClock = 0;
    lockResets = 0;
    shift = { dir: 0, elapsed: 0, repeat: 0, instantDone: false };
    held.clear();
    particles = [];
    lineFlash = 0;
    shake = 0;
    apmWindow = [];
    targetCursor = 0;
    $("startOverlay").classList.toggle("hidden", started);
    $("pauseOverlay").classList.add("hidden");
    $("startButton").innerHTML = "START MATCH <span>→</span>";
    $("battleStatus").textContent = started ? "MATCH IN PROGRESS" : "WAITING FOR MATCH";
    $("combatLog").innerHTML = '<p class="log-muted">Waiting for the first drop...</p>';
    renderAll();
    updateUI();
  }
  function endMatch(won) {
    ended = true;
    started = false;
    paused = false;
    $("pauseOverlay").classList.add("hidden");
    $("startOverlay").classList.remove("hidden");
    const overlay = $("startOverlay");
    overlay.querySelector(".section-kicker").textContent = won ? "MATCH COMPLETE" : "FIELD LOST";
    overlay.querySelector("h2").innerHTML = won ? "CLEAN<br><em>SWEEP.</em>" : "STACK<br><em>OVER.</em>";
    overlay.querySelector(".overlay-copy").textContent = won
      ? "Every opponent has topped out. Nice stacking."
      : "Your field topped out. Adjust your handling and run it back.";
    $("startButton").innerHTML = "PLAY AGAIN <span>→</span>";
    $("battleStatus").textContent = won ? "VICTORY" : "DEFEAT";
    logEvent(won ? "You cleared the arena." : "Your field topped out.", won ? "cyan" : "danger");
  }
  function startMatch() {
    if (ended || !player || !player.alive) resetMatch(true);
    else {
      started = true;
      paused = false;
      $("battleStatus").textContent = "MATCH IN PROGRESS";
    }
    $("startOverlay").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");
    renderAll();
  }
  function togglePause() {
    if (!started || ended) return;
    paused = !paused;
    $("pauseOverlay").classList.toggle("hidden", !paused);
    $("pauseButton").textContent = paused ? "▶" : "Ⅱ";
    $("battleStatus").textContent = paused ? "PAUSED" : "MATCH IN PROGRESS";
  }

  function rotatePlayer(dir) {
    if (!started || paused || !player.alive) return;
    const p = player.current;
    const from = p.rot, to = (from + dir + 4) % 4;
    if (p.type === "O") {
      p.rot = to;
      p.lastRotate = true;
      p.kick = 0;
      p.lastAction = "rotate";
      resetLockOnAction();
      player.lastMove = "ROTATE";
      player.spin = "—";
      return;
    }
    let tests;
    if (Math.abs(dir) === 2) {
      tests = p.type === "I" || p.type === "S" || p.type === "Z" ? K180_I : K180_MAIN;
    } else {
      const key = from + ">" + to;
      tests = (p.type === "I" ? IK : JL)[key] || [[0,0]];
    }
    for (let i = 0; i < tests.length; i++) {
      const [dx,dy] = tests[i];
      if (!collides(player.board, p, p.x + dx, p.y + dy, to)) {
        p.x += dx;
        p.y += dy;
        p.rot = to;
        p.lastRotate = true;
        p.kick = i;
        p.lastAction = "rotate";
        resetLockOnAction();
        player.lastMove = dir === 2 || dir === -2 ? "180° ROTATE" : (dir > 0 ? "CW ROTATE" : "CCW ROTATE");
        player.spin = "—";
        if (i > 0) spawnParticles(150, 310, 5, COLORS[p.type]);
        return;
      }
    }
  }
  function resetLockOnAction() {
    if (lockResets < 15) {
      lockClock = 0;
      lockResets++;
    }
  }
  function movePlayer(dx) {
    if (!started || paused || !player.alive) return false;
    const p = player.current;
    if (!collides(player.board, p, p.x + dx, p.y, p.rot)) {
      p.x += dx;
      p.lastRotate = false;
      p.lastAction = "move";
      resetLockOnAction();
      player.lastMove = dx < 0 ? "LEFT" : "RIGHT";
      player.spin = "—";
      return true;
    }
    return false;
  }
  function shiftToWall(dir) {
    let moved = false;
    while (movePlayer(dir)) moved = true;
    return moved;
  }
  function beginShift(dir) {
    if (!started || paused) return;
    held.add(dir < 0 ? "left" : "right");
    const previousDir = shift.dir;
    const carriedCharge = previousDir !== 0 && previousDir !== dir && !settings.dasCancel;
    shift.dir = dir;
    if (!carriedCharge) {
      shift.elapsed = 0;
      shift.repeat = 0;
      shift.instantDone = false;
    }
    movePlayer(dir);
  }
  function endShift(dir) {
    held.delete(dir < 0 ? "left" : "right");
    const other = dir < 0 ? "right" : "left";
    if (held.has(other)) {
      shift.dir = other === "left" ? -1 : 1;
      shift.elapsed = settings.dasCancel ? 0 : shift.elapsed;
      shift.repeat = 0;
      shift.instantDone = false;
    } else {
      shift.dir = 0;
      shift.elapsed = 0;
      shift.repeat = 0;
      shift.instantDone = false;
    }
  }
  function updateShift(dt) {
    if (!shift.dir || !started || paused) return;
    shift.elapsed += dt;
    if (shift.elapsed < settings.das) return;
    if (settings.arr === 0) {
      if (!shift.instantDone) {
        shiftToWall(shift.dir);
        shift.instantDone = true;
      }
      return;
    }
    shift.repeat += dt;
    while (shift.repeat >= settings.arr) {
      shift.repeat -= settings.arr;
      if (!movePlayer(shift.dir)) break;
    }
  }
  function softDropHeld() { return held.has("down"); }
  function hardDrop() {
    if (!started || paused || !player.alive) return;
    const p = player.current;
    const landing = ghostY(player.board, p);
    const distance = landing - p.y;
    p.y = landing;
    player.score += Math.max(0, distance) * 2;
    player.lastMove = "HARD DROP";
    lockPlayer();
    shake = Math.max(shake, 4);
    spawnParticles(150, 580, 18, "#b6d9ec");
  }
  function holdPiece() {
    if (!started || paused || !player.alive || player.holdUsed) return;
    const old = player.current.type;
    if (player.hold) player.current = makePiece(player.hold);
    else player.current = takeNext(player);
    player.hold = old;
    player.holdUsed = true;
    lockClock = 0;
    lockResets = 0;
    if (collides(player.board, player.current)) playerTopOut();
    player.lastMove = "HOLD";
    player.spin = "—";
    renderAll();
  }
  function processSoftDrop(dt) {
    if (!softDropHeld() || !started || paused || !player.alive) return;
    if (settings.sdf >= 21) {
      const landing = ghostY(player.board, player.current);
      const distance = landing - player.current.y;
      if (distance > 0) {
        player.current.y = landing;
        player.score += distance;
        player.current.lastRotate = false;
        player.lastMove = "SONIC DROP";
      }
      return;
    }
    const interval = Math.max(12, gravityInterval(player.level) / settings.sdf);
    softClock += dt;
    while (softClock >= interval) {
      softClock -= interval;
      if (collides(player.board, player.current, player.current.x, player.current.y + 1)) break;
      player.current.y++;
      player.score++;
      player.current.lastRotate = false;
      player.lastMove = "SOFT DROP";
    }
  }
  function gravityInterval(level) {
    return Math.max(45, 950 * Math.pow(0.82, Math.max(0, level - 1)));
  }
  function updatePlayer(dt) {
    if (!player.alive) return;
    updateShift(dt);
    processSoftDrop(dt);
    if (softDropHeld()) {
      // Soft-drop timing above fully replaces gravity while held.
      // At SDF = infinity the piece has already sonic-dropped to the ghost.
      gravityClock = 0;
    } else {
      gravityClock += dt;
      const interval = gravityInterval(player.level);
      while (gravityClock >= interval) {
        gravityClock -= interval;
        if (!collides(player.board, player.current, player.current.x, player.current.y + 1)) player.current.y++;
      }
    }
    if (collides(player.board, player.current, player.current.x, player.current.y + 1)) {
      lockClock += dt;
      if (lockClock >= 500) lockPlayer();
    } else {
      lockClock = 0;
    }
    processGarbage(player, dt, true);
  }

  function isOccupied(board, x, y) {
    if (x < 0 || x >= W || y >= H) return true;
    if (y < 0) return false;
    return Boolean(board[y][x]);
  }
  function classifyTSpin(piece, board) {
    if (piece.type !== "T" || !piece.lastRotate) return "—";
    const cx = piece.x + 1, cy = piece.y + 1;
    const corners = [
      isOccupied(board, cx - 1, cy - 1), isOccupied(board, cx + 1, cy - 1),
      isOccupied(board, cx - 1, cy + 1), isOccupied(board, cx + 1, cy + 1)
    ];
    if (corners.filter(Boolean).length < 3) return "—";
    const front = {
      0: [0,1], 1: [1,3], 2: [2,3], 3: [0,2]
    }[piece.rot];
    const frontCount = Number(corners[front[0]]) + Number(corners[front[1]]);
    return frontCount === 2 || piece.kick === 4 ? "T-SPIN" : "MINI T-SPIN";
  }
  function attackFor(lines, spin, combo, b2bContinues) {
    let base = [0,0,1,2,4][lines] || 0;
    if (spin === "T-SPIN") base = [0,2,4,6][lines] || 0;
    if (spin === "MINI T-SPIN") base = [0,1,2,0,0][lines] || 0;
    let attack = base;
    if (combo >= 1) {
      attack = base > 0
        ? Math.floor(base * (1 + 0.25 * combo))
        : Math.floor(Math.log1p(1.25 * combo));
    }
    if (base > 0 && b2bContinues) attack += 1;
    return Math.max(0, attack);
  }
  function scoreFor(lines, spin, level) {
    const normal = [0,100,300,500,800][lines] || 0;
    const full = [400,800,1200,1600][lines] || 0;
    const mini = [100,200,400][lines] || 0;
    if (spin === "T-SPIN") return (full || 400) * level;
    if (spin === "MINI T-SPIN") return (mini || 100) * level;
    return normal * level;
  }
  function lockPlayer() {
    if (!player.alive) return;
    const piece = clonePiece(player.current);
    const spin = classifyTSpin(piece, player.board);
    if (!mergePiece(player.board, piece)) {
      playerTopOut();
      return;
    }
    const cleared = clearLines(player.board);
    player.pieces++;
    player.holdUsed = false;
    player.spin = spin;
    player.lastMove = spin !== "—" ? spin + (cleared ? " " + cleared + " LINE" + (cleared > 1 ? "S" : "") : "") : (cleared ? "LINE CLEAR ×" + cleared : "LOCK");
    const difficult = (spin !== "—" && cleared > 0) || cleared === 4;
    const b2bContinues = player.b2b > 0 && difficult;
    if (cleared > 0) player.combo++;
    else player.combo = -1;
    if (difficult) player.b2b++;
    else if (cleared > 0) player.b2b = 0;
    const attack = attackFor(cleared, spin, player.combo, b2bContinues);
    player.score += scoreFor(cleared, spin, player.level) + (cleared ? player.combo * 50 * player.level : 0);
    player.lines += cleared;
    player.level = 1 + Math.floor(player.lines / 10);
    const unblockedAttack = cancelIncoming(player, attack);
    if (unblockedAttack) sendPlayerAttack(unblockedAttack);
    if (cleared) {
      lineFlash = 180;
      shake = Math.min(8, 2 + cleared * 1.4);
      for (let i = 0; i < cleared * 18; i++) {
        const x = Math.random() * 300, y = 600 - Math.random() * 600;
        spawnParticles(x, y, 1, COLORS[piece.type]);
      }
      logEvent(actionName(spin, cleared, attack), "cyan");
    }
    if (spin !== "—") spawnParticles(150, 340, spin === "T-SPIN" ? 18 : 10, COLORS.T);
    player.current = takeNext(player);
    lockClock = gravityClock = softClock = 0;
    lockResets = 0;
    player.current.lastRotate = false;
    if (collides(player.board, player.current)) playerTopOut();
    updateUI();
  }
  function actionName(spin, lines, attack) {
    let label = spin === "—" ? (lines === 4 ? "TETRIS" : lines + " LINE CLEAR") : spin + (lines ? " " + lines : "");
    if (attack) label += "  ·  " + attack + " ATTACK";
    return label;
  }
  function playerTopOut() {
    player.alive = false;
    endMatch(false);
  }

  function cancelIncoming(state, amount) {
    let remaining = amount;
    while (remaining > 0 && state.incoming.length) {
      state.incoming.shift();
      remaining--;
    }
    return remaining;
  }
  function enqueueGarbage(target, amount) {
    if (!target.alive || amount <= 0) return;
    for (let i = 0; i < amount; i++) target.incoming.push(Math.floor(Math.random() * W));
    if (target.incomingClock < 500) target.incomingClock = 650;
  }
  function processGarbage(state, dt, isPlayer) {
    if (!state.alive || !state.incoming.length) return;
    state.incomingClock -= dt;
    if (state.incomingClock > 0) return;
    const hole = state.incoming.shift();
    const removed = state.board.shift();
    state.board.push(Array.from({ length: W }, (_, x) => x === hole ? null : "G"));
    if (removed.some(Boolean)) {
      if (isPlayer) playerTopOut();
      else state.alive = false;
      return;
    }
    state.incomingClock = 310;
    if (isPlayer) {
      shake = Math.max(shake, 3);
      spawnParticles(150, 560, 8, COLORS.G);
      logEvent("GARBAGE RECEIVED  ·  " + state.incoming.length + " LEFT", "danger");
    }
  }
  function sendPlayerAttack(amount) {
    const aliveBots = bots.filter((bot) => bot.alive);
    if (!aliveBots.length || amount <= 0) return;
    const target = aliveBots[targetCursor % aliveBots.length];
    targetCursor++;
    enqueueGarbage(target, amount);
    player.sent += amount;
    player.attackFlash = 500;
    apmWindow.push(Date.now());
    logEvent("YOU → " + target.name + "  +" + amount + " GARBAGE", "cyan");
  }
  function sendBotAttack(bot, amount) {
    if (!player.alive || amount <= 0) return;
    enqueueGarbage(player, amount);
    bot.sent += amount;
    logEvent(bot.name + " → YOU  +" + amount + " GARBAGE", "danger");
  }

  function evaluateBoard(board) {
    const heights = [];
    let holes = 0, aggregate = 0, bump = 0;
    for (let x = 0; x < W; x++) {
      let height = 0, seen = false;
      for (let y = 0; y < H; y++) {
        if (board[y][x]) {
          if (!seen) { height = H - y; seen = true; }
        } else if (seen) holes++;
      }
      heights.push(height);
      aggregate += height;
    }
    for (let x = 0; x < W - 1; x++) bump += Math.abs(heights[x] - heights[x + 1]);
    const maxHeight = Math.max(...heights);
    return { holes, aggregate, bump, maxHeight };
  }
  function bestBotPlacement(bot) {
    const piece = bot.current;
    let best = null, bestValue = -Infinity;
    for (let rot = 0; rot < 4; rot++) {
      for (let x = -2; x < W; x++) {
        let y = 0;
        if (collides(bot.board, piece, x, y, rot)) continue;
        while (!collides(bot.board, piece, x, y + 1, rot)) y++;
        const trial = cloneBoard(bot.board);
        const placed = { ...piece, x, y, rot };
        if (!mergePiece(trial, placed)) continue;
        const lines = clearLines(trial);
        const metrics = evaluateBoard(trial);
        let value = -metrics.holes * 5.8 - metrics.aggregate * 0.49 - metrics.bump * 0.38 - metrics.maxHeight * 0.7 + lines * [0,2.1,5.0,8.5,15.2][lines];
        if (lines === 4) value += 3;
        if (rot === 0) value += 0.1;
        value += (Math.random() - 0.5) * (bot.index === 0 ? 2.2 : bot.index === 1 ? 0.8 : 0.3);
        if (value > bestValue) {
          bestValue = value;
          best = { x, y, rot, board: trial, lines };
        }
      }
    }
    return best;
  }
  function botStep(bot) {
    if (!bot.alive) return;
    const best = bestBotPlacement(bot);
    if (!best) { bot.alive = false; return; }
    const spin = "—";
    const b2bContinues = bot.b2b > 0 && best.lines === 4;
    if (best.lines > 0) bot.combo++;
    else bot.combo = -1;
    if (best.lines === 4) bot.b2b++;
    else if (best.lines > 0) bot.b2b = 0;
    const attack = attackFor(best.lines, spin, bot.combo, b2bContinues);
    bot.board = best.board;
    bot.lines += best.lines;
    bot.pieces++;
    bot.score += scoreFor(best.lines, spin, 1);
    const unblockedAttack = cancelIncoming(bot, attack);
    if (unblockedAttack) sendBotAttack(bot, unblockedAttack);
    if (best.lines && Math.random() < 0.4) logEvent(bot.name + " cleared " + best.lines + " lines.", "muted");
    bot.current = takeNext(bot);
    if (collides(bot.board, bot.current)) bot.alive = false;
  }
  function updateBots(dt) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      processGarbage(bot, dt, false);
      if (!bot.alive) continue;
      bot.clock += dt;
      if (bot.clock >= bot.pace) {
        bot.clock = 0;
        botStep(bot);
      }
    }
    if (bots.length && bots.every((bot) => !bot.alive) && player.alive) endMatch(true);
  }

  function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 125;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25,
        life: 280 + Math.random() * 420, max: 700, color,
        size: 1.4 + Math.random() * 2.2
      });
    }
  }
  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 150 * dt / 1000;
      return p.life > 0;
    });
    lineFlash = Math.max(0, lineFlash - dt);
    shake = Math.max(0, shake - dt * 0.025);
    if (player) player.attackFlash = Math.max(0, player.attackFlash - dt);
  }
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function drawCell(ctx, x, y, color, size, alpha = 1, ghost = false) {
    const px = x * size, py = y * size;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (ghost) {
      ctx.fillStyle = color;
      ctx.globalAlpha = .13;
      ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
      ctx.globalAlpha = .72 * alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(px + 1.3, py + 1.3, size - 2.6, size - 2.6);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(px + 2, py + 2, size - 4, 1.3);
      ctx.fillStyle = "rgba(0,0,0,.13)";
      ctx.fillRect(px + 2, py + size - 3.2, size - 4, 1.2);
    }
    ctx.restore();
  }
  function drawBoard(canvas, board, active, small = false) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cw = canvas.width, ch = canvas.height, size = cw / W;
    ctx.clearRect(0, 0, cw, ch);
    const bg = document.body.dataset.theme === "sunset" ? "#160f1b" : "#08111e";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = small ? "rgba(130,160,190,.055)" : "rgba(130,170,205,.09)";
    ctx.lineWidth = 1;
    for (let x = 1; x < W; x++) {
      ctx.beginPath(); ctx.moveTo(x * size + .5, 0); ctx.lineTo(x * size + .5, ch); ctx.stroke();
    }
    for (let y = 1; y < H; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * size + .5); ctx.lineTo(cw, y * size + .5); ctx.stroke();
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const type = board[y][x];
        if (type) drawCell(ctx, x, y, COLORS[type] || COLORS.G, size, 1, false);
      }
    }
    if (active && !small) {
      const gy = ghostY(board, active);
      for (const [x,y] of cellsOf(active, active.x, gy, active.rot)) if (y >= 0) drawCell(ctx, x, y, COLORS[active.type], size, .85, true);
      for (const [x,y] of cellsOf(active, active.x, active.y, active.rot)) if (y >= 0) drawCell(ctx, x, y, COLORS[active.type], size, 1, false);
    }
    if (!small && particles.length) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
    if (!small && lineFlash > 0) {
      ctx.fillStyle = "rgba(218,255,255," + (lineFlash / 180 * .13) + ")";
      ctx.fillRect(0, 0, cw, ch);
    }
    if (!small && player && player.attackFlash > 0) {
      ctx.strokeStyle = "rgba(255,112,141," + player.attackFlash / 500 + ")";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, cw - 6, ch - 6);
    }
  }
  function drawPreview(canvas, type, yOffset = 0, cell = 15) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!type) return;
    const shape = SHAPES[type][0];
    const size = BASE[type].size;
    const xs = shape.map((c) => c[0]), ys = shape.map((c) => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pieceW = (maxX - minX + 1) * cell, pieceH = (maxY - minY + 1) * cell;
    const startX = Math.floor((w - pieceW) / 2) - minX * cell;
    const startY = yOffset + Math.floor((Math.min(h, 52) - pieceH) / 2) - minY * cell;
    for (const [x,y] of shape) {
      ctx.fillStyle = COLORS[type];
      ctx.fillRect(startX + x * cell + 1, startY + y * cell + 1, cell - 2, cell - 2);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(startX + x * cell + 2, startY + y * cell + 2, cell - 4, 1);
    }
  }
  function renderPreviews() {
    drawPreview($("holdCanvas"), player && player.hold, 0, 17);
    const canvas = $("nextCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!player) return;
    for (let i = 0; i < Math.min(5, player.queue.length); i++) {
      if (i > 0) {
        ctx.strokeStyle = "rgba(153,177,211,.09)";
        ctx.beginPath(); ctx.moveTo(11, i * 66); ctx.lineTo(129, i * 66); ctx.stroke();
      }
      const type = player.queue[i], cell = i === 0 ? 16 : 14;
      const shape = SHAPES[type][0];
      const minX = Math.min(...shape.map((v) => v[0]));
      const maxX = Math.max(...shape.map((v) => v[0]));
      const minY = Math.min(...shape.map((v) => v[1]));
      const maxY = Math.max(...shape.map((v) => v[1]));
      const px = (140 - (maxX - minX + 1) * cell) / 2 - minX * cell;
      const py = i * 66 + (60 - (maxY - minY + 1) * cell) / 2 - minY * cell;
      for (const [x,y] of shape) {
        ctx.fillStyle = COLORS[type];
        ctx.fillRect(px + x * cell + 1, py + y * cell + 1, cell - 2, cell - 2);
        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.fillRect(px + x * cell + 2, py + y * cell + 2, cell - 4, 1);
      }
    }
  }
  function renderAll() {
    if (!player) return;
    const frame = $("boardFrame");
    frame.style.transform = shake > 0 ? "translate(" + ((Math.random() - .5) * shake) + "px," + ((Math.random() - .5) * shake) + "px)" : "";
    drawBoard($("playerBoard"), player.board, player.current, false);
    for (const bot of bots) drawBoard($("botBoard" + bot.index), bot.board, null, true);
    renderPreviews();
    updateUI();
  }
  function updateUI() {
    if (!player) return;
    $("scoreValue").textContent = player.score.toLocaleString();
    $("linesValue").textContent = player.lines;
    $("levelValue").textContent = player.level;
    $("comboValue").textContent = player.combo < 0 ? "—" : player.combo;
    $("b2bValue").textContent = player.b2b ? "×" + player.b2b : "—";
    $("incomingValue").textContent = player.incoming.length;
    $("incomingBar").style.width = Math.min(100, player.incoming.length * 10) + "%";
    $("incomingNote").textContent = player.incoming.length ? "GARBAGE INCOMING  ·  " + player.incoming.length + " LINES" : "NO INCOMING ATTACKS";
    $("attackValue").textContent = player.sent;
    $("piecesValue").textContent = player.pieces;
    const now = Date.now();
    apmWindow = apmWindow.filter((time) => now - time < 60000);
    $("apmValue").textContent = apmWindow.length;
    $("holdHint").textContent = player.hold ? "READY TO SWAP" : "EMPTY — TAP C TO HOLD";
    $("lastMove").textContent = player.lastMove;
    $("spinValue").textContent = player.spin;
    $("speedLabel").textContent = (950 / gravityInterval(player.level)).toFixed(1) + "× GRAVITY";
    $("pauseButton").textContent = paused ? "▶" : "Ⅱ";
    for (const bot of bots) {
      const i = bot.index;
      $("botLines" + i).textContent = bot.lines;
      $("botAttack" + i).textContent = bot.sent;
      $("botIncoming" + i).textContent = bot.incoming.length;
      $("botHealth" + i).style.width = Math.max(0, 100 - evaluateBoard(bot.board).maxHeight * 5) + "%";
      $("botState" + i).textContent = !bot.alive ? "OUT" : (started ? "ACTIVE" : "IDLE");
      $("botState" + i).classList.toggle("active", bot.alive && started);
      $("botState" + i).classList.toggle("out", !bot.alive);
      const card = document.querySelector('.opponent-card[data-bot="' + i + '"]');
      card.classList.toggle("dead", !bot.alive);
      card.classList.toggle("targeted", bot.alive && bot.incoming.length > 0);
    }
  }
  function logEvent(message, tone) {
    const log = $("combatLog");
    const p = document.createElement("p");
    if (tone === "cyan") p.style.color = "#69dfd3";
    if (tone === "danger") p.style.color = "#ff829b";
    if (tone === "muted") p.style.color = "#8497b1";
    p.textContent = "› " + message;
    log.prepend(p);
    while (log.children.length > 6) log.removeChild(log.lastChild);
  }

  function loop(timestamp) {
    const dt = Math.min(50, timestamp - (lastFrame || timestamp));
    lastFrame = timestamp;
    if (started && !paused && !ended) {
      updatePlayer(dt);
      updateBots(dt);
      updateParticles(dt);
      renderAll();
    } else if (particles.length) {
      updateParticles(dt);
      renderAll();
    }
    requestAnimationFrame(loop);
  }

  function updateSliderUI() {
    $("dasOutput").textContent = settings.das === 0 ? "INSTANT" : settings.das + " ms";
    $("arrOutput").textContent = settings.arr === 0 ? "INSTANT" : settings.arr + " ms";
    $("sdfOutput").textContent = settings.sdf >= 21 ? "∞ INSTANT" : settings.sdf + "×";
    $("dasSlider").value = settings.das;
    $("arrSlider").value = settings.arr;
    $("sdfSlider").value = settings.sdf;
    $("dasCancel").checked = settings.dasCancel;
    ["dasSlider","arrSlider","sdfSlider"].forEach((id) => {
      const input = $(id), min = Number(input.min), max = Number(input.max);
      const percentage = ((Number(input.value) - min) / (max - min)) * 100;
      input.style.background = "linear-gradient(90deg, #4fe1d1 0%, #4fe1d1 " + percentage + "%, #29364a " + percentage + "%, #29364a 100%)";
    });
  }
  function saveSettings() {
    try { localStorage.setItem("stacklab-settings", JSON.stringify(settings)); } catch (_) {}
    updateSliderUI();
  }
  $("dasSlider").addEventListener("input", (event) => { settings.das = Number(event.target.value); saveSettings(); });
  $("arrSlider").addEventListener("input", (event) => { settings.arr = Number(event.target.value); saveSettings(); });
  $("sdfSlider").addEventListener("input", (event) => { settings.sdf = Number(event.target.value); saveSettings(); });
  $("dasCancel").addEventListener("change", (event) => { settings.dasCancel = event.target.checked; saveSettings(); });
  $("themeSelect").addEventListener("change", (event) => {
    document.body.dataset.theme = event.target.value;
    try { localStorage.setItem("stacklab-theme", event.target.value); } catch (_) {}
    renderAll();
  });
  try {
    const theme = localStorage.getItem("stacklab-theme");
    if (theme && ["aurora","midnight","sunset"].includes(theme)) {
      document.body.dataset.theme = theme;
      $("themeSelect").value = theme;
    }
  } catch (_) {}
  $("startButton").addEventListener("click", startMatch);
  $("pauseButton").addEventListener("click", togglePause);
  $("restartButton").addEventListener("click", () => resetMatch(true));
  $("editKeybinds").addEventListener("click", openKeybindEditor);
  $("closeKeybinds").addEventListener("click", closeKeybindEditor);
  $("doneKeybinds").addEventListener("click", closeKeybindEditor);
  $("keybindModal").addEventListener("click", (event) => {
    if (event.target === $("keybindModal")) closeKeybindEditor();
  });
  $("resetKeybinds").addEventListener("click", () => {
    keybinds = { ...defaultKeybinds };
    captureAction = null;
    saveKeybinds();
    $("keybindStatus").textContent = "Default keybinds restored.";
  });

  function isTypingTarget(target) {
    return target && (["INPUT","SELECT","TEXTAREA"].includes(target.tagName) || target.isContentEditable);
  }
  function actionForKey(code) {
    return Object.keys(keybinds).find((action) => keybinds[action] === code) || null;
  }
  window.addEventListener("keydown", (event) => {
    if (captureAction) {
      event.preventDefault();
      if (event.code === "Escape") {
        const action = captureAction;
        captureAction = null;
        $("keybindStatus").textContent = "Binding cancelled.";
        renderKeybinds();
      } else if (event.code === "Tab" || event.code.startsWith("Shift") ||
                 event.code.startsWith("Control") || event.code.startsWith("Alt") ||
                 event.code.startsWith("Meta") || event.code === "CapsLock") {
        return;
      } else {
        assignCapturedKey(event.code);
      }
      return;
    }
    const modalOpen = !$("keybindModal").classList.contains("hidden");
    if (modalOpen) {
      if (event.code === "Escape") closeKeybindEditor();
      return;
    }
    if (isTypingTarget(event.target)) return;
    const action = actionForKey(event.code);
    if (action) event.preventDefault();
    if (!action) return;
    if (event.repeat && !["left","right","down"].includes(action)) return;
    if (action === "start" && !started) { startMatch(); return; }
    if (action === "pause") { togglePause(); return; }
    if (action === "restart") { resetMatch(true); return; }
    if (!started || paused) return;
    if (action === "left" && !event.repeat) beginShift(-1);
    else if (action === "right" && !event.repeat) beginShift(1);
    else if (action === "down") held.add("down");
    else if (action === "hardDrop") hardDrop();
    else if (action === "rotateCCW") rotatePlayer(-1);
    else if (action === "rotateCW") rotatePlayer(1);
    else if (action === "rotate180") rotatePlayer(2);
    else if (action === "hold") holdPiece();
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === keybinds.left) endShift(-1);
    if (event.code === keybinds.right) endShift(1);
    if (event.code === keybinds.down) held.delete("down");
  });
  window.addEventListener("blur", () => {
    held.clear();
    shift.dir = 0;
    if (started && !paused) togglePause();
  });

  document.querySelectorAll("[data-touch]").forEach((button) => {
    const action = button.dataset.touch;
    const stop = () => {
      if (action === "left") endShift(-1);
      if (action === "right") endShift(1);
      if (action === "down") held.delete("down");
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!started) { startMatch(); return; }
      if (action === "left") beginShift(-1);
      else if (action === "right") beginShift(1);
      else if (action === "down") held.add("down");
      else if (action === "cw") rotatePlayer(1);
      else if (action === "ccw") rotatePlayer(-1);
      else if (action === "180") rotatePlayer(2);
      else if (action === "hard") hardDrop();
      else if (action === "hold") holdPiece();
      if (["left","right","down"].includes(action)) button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  });

  updateSliderUI();
  renderKeybinds();
  resetMatch(false);
  requestAnimationFrame(loop);
})();