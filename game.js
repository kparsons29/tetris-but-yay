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
  // A true 7-bag: every shuffled batch contains each of the seven tetrominoes once.
  const shuffledSevenBag = () => {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  };
  // Keep two full bags queued so the five-piece preview never runs dry.
  const newQueue = () => [...shuffledSevenBag(), ...shuffledSevenBag()];
  const makePiece = (type) => ({
    type, x: Math.floor((W - BASE[type].size) / 2), y: 0, rot: 0,
    lastRotate: false, allSpinCandidate: false, kick: 0, lastAction: "spawn"
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

  const defaultSettings = { das: 100, arr: 20, sdf: 10, dasCancel: false };
  let settings = { ...defaultSettings };
  try {
    const saved = JSON.parse(localStorage.getItem("stacklab-settings") || "{}");
    settings = { ...settings, ...saved };
    // Migrate the previous 120 ms default once; preserve all other saved handling values.
    if (localStorage.getItem("stacklab-latency-default-version") !== "2") {
      if (settings.das === 120) settings.das = 100;
      localStorage.setItem("stacklab-latency-default-version", "2");
      localStorage.setItem("stacklab-settings", JSON.stringify(settings));
    }
  } catch (_) { /* ignore malformed or unavailable local settings */ }
  let pieceSkin = "classic";
  try {
    const savedSkin = localStorage.getItem("stacklab-piece-skin");
    if (["classic","flat","glass","neon"].includes(savedSkin)) pieceSkin = savedSkin;
  } catch (_) {}

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
    const botHoldKey = $("botDisplayHold");
    if (botHoldKey) botHoldKey.textContent = keyLabel(keybinds.hold);
    const summary = $("keybindSummary");
    if (summary) {
      summary.textContent = "";
      for (const action of ["left","right","down","hardDrop","rotateCCW","rotateCW","rotate180","hold"]) {
        const item = document.createElement("span");
        const label = keybindActions.find(([id]) => id === action)[1];
        item.append(document.createTextNode(label.toUpperCase()));
        const key = document.createElement("kbd");
        key.textContent = keyLabel(keybinds[action]);
        item.append(key);
        summary.append(item);
      }
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
  let currentPage = "homePage";
  let currentMode = "sprint";
  let selectedMode = "sprint";
  let selectedBotLevel = 3;
  let selectedSurvivalDifficulty = 1;
  let runElapsed = 0;
  let blitzRemaining = 120000;
  let survivalRemaining = 60000;
  let survivalCredit = 0;
  let survivalPendingRows = 0;
  let survivalTotalLines = 0;
  let survivalApplyNextFrame = false;
  let survivalLastHole = null;
  let selectedStats = ["score", "lines", "time", "pps"];
  const STAT_INFO = {
    score: ["SCORE", () => player.score.toLocaleString()],
    lines: ["LINES", () => player.lines],
    time: ["TIME", () => formatTime(currentMode === "blitz" ? Math.max(0, blitzRemaining) : currentMode === "survival" ? Math.max(0, survivalRemaining) : runElapsed)],
    level: ["LEVEL", () => player.level],
    combo: ["COMBO", () => player.combo < 0 ? "—" : player.combo + 1],
    b2b: ["B2B", () => player.b2b ? "×" + player.b2b : "—"],
    pieces: ["PIECES", () => player.pieces],
    pps: ["PPS", () => (player.pieces / Math.max(runElapsed / 1000, 0.001)).toFixed(2)],
    apm: ["APM", () => { const now = Date.now(); apmWindow = apmWindow.filter((time) => now - time < 60000); return apmWindow.length; }],
    attack: ["ATTACK", () => player.sent],
    incoming: ["INCOMING", () => currentMode === "survival" ? survivalPendingRows : player.incoming.length]
  };
  const MODE_INFO = {
    cheese: { title: "100 LINE CHEESE", kicker: "SINGLEPLAYER / 100L CHEESE", objective: "DIG THROUGH THE CHEESE · CLEAR 100 LINES" },
    sprint: { title: "40 LINE SPRINT", kicker: "SINGLEPLAYER / 40L SPRINT", objective: "CLEAR 40 LINES AS FAST AS POSSIBLE" },
    blitz: { title: "2 MIN BLITZ", kicker: "SINGLEPLAYER / 2 MIN BLITZ", objective: "SCORE AS MUCH AS POSSIBLE IN 2 MINUTES" },
    botplay: { title: "BOTPLAY", kicker: "SINGLEPLAYER / BOTPLAY", objective: "TOP OUT YOUR 1V1 OPPONENT" },
    survival: { title: "SURVIVAL", kicker: "SINGLEPLAYER / SURVIVAL", objective: "SURVIVE FOR ONE MINUTE WITHOUT TOPPING OUT" }
  };
  const SURVIVAL_LINES_PER_MINUTE = [0, 5, 10, 16, 25, 38, 55, 78, 108, 150, 210];
  function survivalLinesPerMinute(difficulty = selectedSurvivalDifficulty) {
    return SURVIVAL_LINES_PER_MINUTE[difficulty] || SURVIVAL_LINES_PER_MINUTE[1];
  }
  // Cold Clear supplies placement quality; these tiers control its search budget
  // and deliberately slower in-game placement cadence.
  const BOT_TIERS = [
    null,
    { rank: "D–D+", pps: 0.38, apm: 8.1, app: 0.18, pace: 1000/0.38, maxNodes: 100000 },
    { rank: "C−–C", pps: 0.48, apm: 11.85, app: 0.23, pace: 1000/0.48, maxNodes: 250000 },
    { rank: "LOW B", pps: 0.60, apm: 19.1, app: 0.30, pace: 1000/0.60, maxNodes: 500000 },
    { rank: "A", pps: 0.74, apm: 28.4, app: 0.37, pace: 1000/0.74, maxNodes: 1000000 },
    { rank: "S+", pps: 0.90, apm: 56.4, app: 0.54, pace: 1000/0.90, maxNodes: 2000000 }
  ];
  try {
    const savedStats = JSON.parse(localStorage.getItem("stacklab-visible-stats") || "null");
    if (Array.isArray(savedStats)) selectedStats = savedStats.filter((key) => Object.prototype.hasOwnProperty.call({
      score:1,lines:1,time:1,level:1,combo:1,b2b:1,pieces:1,pps:1,apm:1,attack:1,incoming:1
    }, key));
    // Add PPS once to existing saved HUD profiles, then respect later opt-outs.
    if (localStorage.getItem("stacklab-visible-stats-version") !== "2") {
      if (!selectedStats.includes("pps")) selectedStats.push("pps");
      localStorage.setItem("stacklab-visible-stats-version", "2");
    }
  } catch (_) { /* use defaults when storage is unavailable */ }
  let lastFrame = 0, gravityClock = 0, softClock = 0, lockClock = 0, lockResets = 0;
  let shift = { dir: 0, elapsed: 0, repeat: 0, instantDone: false };
  let held = new Set();
  let particles = [];
  let lineFlash = 0;
  let shake = 0;
  let clearPopupRemaining = 0;
  let attackPopupRemaining = 0;
  let cancelPopupRemaining = 0;
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
    // The queue is made from complete shuffled seven-piece bags. Start with
    // two bags, then append the next bag as soon as we enter the second one
    // (six pieces remain after dealing its first piece). This keeps the five-
    // piece preview populated without ever breaking 7-bag boundaries.
    const type = state.queue.shift();
    if (state.queue.length <= 6) state.queue.push(...shuffledSevenBag());
    return makePiece(type);
  }
  function createBot(index, name, difficulty, pace, level = 3) {
    const tier = BOT_TIERS[level] || BOT_TIERS[3];
    const state = {
      index, name, difficulty, level, rank: tier.rank,
      pace: tier.pace, clock: 0,
      targetPPS: tier.pps, targetAPM: tier.apm, targetAPP: tier.app,
      board: makeBoard(), queue: newQueue(), current: null, hold: null, combo: -1, b2b: 0, levelScore: 1,
      incoming: [], incomingClock: 1000, lines: 0, sent: 0, alive: true,
      pieces: 0, score: 0, dirty: true, lastGarbageHole: null,
      clearPopupRemaining: 0, attackPopupRemaining: 0, cancelPopupRemaining: 0,
      maxNodes: tier.maxNodes, engineWorker: null, engineReady: false,
      enginePending: false, engineEpoch: 0, requestSequence: 0,
      readyMove: null, engineError: ""
    };
    state.current = takeNext(state);
    startColdClearBot(state);
    return state;
  }
  function showPage(pageId) {
    currentPage = pageId;
    document.querySelectorAll(".page").forEach((page) => page.classList.toggle("hidden", page.id !== pageId));
    $("siteHeader").classList.toggle("game-header", pageId === "gamePage");
    document.body.classList.toggle("in-game", pageId === "gamePage");
    $("appRoot").dataset.page = pageId;
    window.scrollTo(0, 0);
  }
  function formatTime(ms) {
    const safe = Math.max(0, ms);
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const centiseconds = Math.floor((safe % 1000) / 10);
    return String(minutes).padStart(2,"0") + ":" + String(seconds).padStart(2,"0") + "." + String(centiseconds).padStart(2,"0");
  }
  function updateModeScreen() {
    document.querySelectorAll(".mode-card").forEach((card) => card.classList.toggle("selected", card.dataset.mode === selectedMode));
    $("botLevelPicker").classList.toggle("hidden", selectedMode !== "botplay");
    $("survivalDifficultyPicker").classList.toggle("hidden", selectedMode !== "survival");
    $("modeHint").textContent = selectedMode === "cheese" ? "100 lines · dig through garbage"
      : selectedMode === "sprint" ? "40 lines · fastest time wins"
      : selectedMode === "blitz" ? "2 minutes · highest score wins"
      : selectedMode === "survival" ? "1 minute · " + survivalLinesPerMinute() + " garbage lines / min"
      : "1v1 · " + BOT_TIERS[selectedBotLevel].rank + " ranked bot";
    $("botLevelDescription").textContent = "LEVEL " + selectedBotLevel + " · " + BOT_TIERS[selectedBotLevel].rank + " RANK";
    document.querySelectorAll("[data-bot-level]").forEach((button) =>
      button.classList.toggle("selected", Number(button.dataset.botLevel) === selectedBotLevel));
    $("survivalDifficultyDescription").textContent = "LEVEL " + selectedSurvivalDifficulty + " · " + survivalLinesPerMinute() + " LINES / MIN";
    document.querySelectorAll("[data-survival-difficulty]").forEach((button) =>
      button.classList.toggle("selected", Number(button.dataset.survivalDifficulty) === selectedSurvivalDifficulty));
  }
  function seedCheese(board) {
    // A deliberately uneven stack of single-hole garbage for the dig challenge.
    let previousHole = Math.floor(Math.random() * W);
    for (let y = H - 10; y < H; y++) {
      const row = Array(W).fill("G");
      let hole = Math.floor(Math.random() * W);
      if (Math.random() < 0.7) hole = Math.max(0, Math.min(W - 1, previousHole + (Math.random() < 0.5 ? -1 : 1)));
      row[hole] = null;
      board[y] = row;
      previousHole = hole;
    }
  }
  function resetMatch(autostart) {
    bots.forEach(stopColdClearBot);
    bots = [];
    player = createPlayer();
    if (currentMode === "cheese") seedCheese(player.board);
    bots = currentMode === "botplay"
      ? [createBot(0, "STACK BOT", "LEVEL " + selectedBotLevel, BOT_TIERS[selectedBotLevel].pace, selectedBotLevel)]
      : [];
    started = Boolean(autostart);
    paused = false;
    ended = false;
    runElapsed = 0;
    blitzRemaining = 120000;
    survivalRemaining = 60000;
    survivalCredit = 0;
    survivalPendingRows = 0;
    survivalTotalLines = 0;
    survivalApplyNextFrame = false;
    survivalLastHole = null;
    gravityClock = softClock = lockClock = 0;
    lockResets = 0;
    shift = { dir: 0, elapsed: 0, repeat: 0, instantDone: false };
    held.clear();
    particles = [];
    lineFlash = 0;
    shake = 0;
    clearPopupRemaining = 0;
    attackPopupRemaining = 0;
    cancelPopupRemaining = 0;
    $("clearPopup").classList.remove("visible");
    $("clearPopup").textContent = "";
    $("attackPopup").classList.remove("visible");
    $("cancelPopup").classList.remove("visible");
    $("botClearPopup").classList.remove("visible");
    $("botClearPopup").textContent = "";
    $("botAttackPopup").classList.remove("visible");
    $("botCancelPopup").classList.remove("visible");
    lastUiAt = 0;
    apmWindow = [];
    targetCursor = 0;
    $("pauseOverlay").classList.add("hidden");
    $("resultOverlay").classList.add("hidden");
    $("battleStatus").textContent = started ? "RUN IN PROGRESS" : "READY";
    $("gameModeTitle").textContent = MODE_INFO[currentMode].title;
    $("gameModeKicker").textContent = currentMode === "botplay"
      ? MODE_INFO.botplay.kicker + " / LEVEL " + selectedBotLevel + " · " + BOT_TIERS[selectedBotLevel].rank
      : currentMode === "survival"
        ? MODE_INFO.survival.kicker + " / LEVEL " + selectedSurvivalDifficulty + " · " + survivalLinesPerMinute() + " LPM"
        : MODE_INFO[currentMode].kicker;
    $("runObjective").textContent = MODE_INFO[currentMode].objective;
    $("opponentSide").classList.toggle("hidden", currentMode !== "botplay");
    $("playLayout").classList.toggle("botplay-layout",currentMode === "botplay");
    $("boardObjective").classList.toggle("visible",currentMode !== "botplay");
    botPreviewCacheKey = null;
    if (currentMode === "botplay" && bots[0]) $("botSpeedLabel").textContent = bots[0].targetPPS.toFixed(2) + " PPS";
    if (autostart) showPage("gamePage");
    renderSkinPreview();
    renderAll(true);
  }
  function endMatch(won, reason = "") {
    if (ended) return;
    ended = true;
    started = false;
    paused = false;
    bots.forEach(stopColdClearBot);
    held.clear();
    shift.dir = 0;
    $("pauseOverlay").classList.add("hidden");
    $("resultOverlay").classList.remove("hidden");
    const title = currentMode === "blitz" ? (won ? "TIME'S UP." : "STACK OVER.")
      : currentMode === "survival" ? (won ? "SURVIVED." : "STACK OVER.")
      : won ? (currentMode === "botplay" ? "BOT DEFEATED." : "RUN COMPLETE.") : "STACK OVER.";
    $("resultKicker").textContent = won ? "CHALLENGE COMPLETE" : "RUN ENDED";
    $("resultTitle").textContent = title;
    const summary = currentMode === "sprint" ? "40 lines cleared in " + formatTime(runElapsed) + "."
      : currentMode === "cheese" ? "You dug through " + player.lines + " lines of cheese."
      : currentMode === "blitz" ? "The clock ran out. You scored " + player.score.toLocaleString() + " points."
      : currentMode === "survival" ? (won
        ? "You survived one minute at difficulty " + selectedSurvivalDifficulty + "."
        : "You survived " + formatTime(runElapsed) + " at difficulty " + selectedSurvivalDifficulty + " and received " + survivalTotalLines + " garbage lines.")
      : (won ? "You beat the level " + selectedBotLevel + " " + BOT_TIERS[selectedBotLevel].rank + " bot." : "The level " + selectedBotLevel + " bot won this round.");
    $("resultSummary").textContent = reason || summary;
    const results = [
      ["SCORE", player.score.toLocaleString()],
      ["LINES", player.lines],
      ["TIME", formatTime(runElapsed)],
      [currentMode === "botplay" ? "BOT LINES" : currentMode === "survival" ? "LINES SENT" : "PIECES", currentMode === "botplay" ? (bots[0]?.lines || 0) : currentMode === "survival" ? survivalTotalLines : player.pieces]
    ];
    $("resultStats").textContent = "";
    for (const [label,value] of results) {
      const cell = document.createElement("div");
      const key = document.createElement("span"); key.textContent = label;
      const val = document.createElement("b"); val.textContent = value;
      cell.append(key,val); $("resultStats").append(cell);
    }
    renderAll();
  }
  function startMatch() {
    if (ended || !player || !player.alive) resetMatch(true);
    else {
      started = true;
      paused = false;
      showPage("gamePage");
      $("battleStatus").textContent = "RUN IN PROGRESS";
    }
    $("pauseOverlay").classList.add("hidden");
    $("resultOverlay").classList.add("hidden");
    renderAll();
  }
  function beginSelectedMode() {
    currentMode = selectedMode;
    resetMatch(true);
  }
  function togglePause() {
    if (!started || ended || currentPage !== "gamePage") return;
    paused = !paused;
    $("pauseOverlay").classList.toggle("hidden", !paused);
    $("battleStatus").textContent = paused ? "PAUSED" : "RUN IN PROGRESS";
    if (paused) { held.clear(); shift.dir = 0; }
  }

  function rotatePlayer(dir) {
    if (!started || paused || !player.alive) return;
    const p = player.current;
    const from = p.rot, to = (from + dir + 4) % 4;
    if (p.type === "O") {
      p.rot = to;
      p.lastRotate = true;
      p.allSpinCandidate = isImmobileSpinPosition(player.board, p);
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
        p.allSpinCandidate = isImmobileSpinPosition(player.board, p);
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
      p.allSpinCandidate = false;
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
      // Instant ARR is continuous while the direction is held. Re-check the
      // wall after rotations, because a rotation can open horizontal space.
      shiftToWall(shift.dir);
      shift.instantDone = true;
      return;
    }

    shift.repeat += dt;
    while (shift.repeat >= settings.arr) {
      // Keep one repeat ready while blocked by a wall. Do not consume the
      // ARR tick on collision: a rotation may make this direction movable.
      if (!movePlayer(shift.dir)) {
        shift.repeat = settings.arr;
        break;
      }
      shift.repeat -= settings.arr;
    }
  }
  function softDropHeld() { return held.has("down"); }
  function hardDrop() {
    if (!started || paused || !player.alive) return;
    const p = player.current;
    const landing = ghostY(player.board, p);
    const distance = landing - p.y;
    p.y = landing;
    if (distance > 0) {
      p.lastRotate = false;
      p.allSpinCandidate = false;
    }
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
        player.current.allSpinCandidate = false;
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
      player.current.allSpinCandidate = false;
      player.lastMove = "SOFT DROP";
    }
  }
  function gravityInterval(level) {
    return Math.max(45, 950 * Math.pow(0.82, Math.max(0, level - 1)));
  }
  function updatePlayer(dt) {
    if (!player.alive || ended) return;
    runElapsed += dt;
    if (currentMode === "blitz") {
      blitzRemaining = Math.max(0, blitzRemaining - dt);
      if (blitzRemaining <= 0) {
        endMatch(true, "Two minutes are up. Final score: " + player.score.toLocaleString() + ".");
        return;
      }
    } else if (currentMode === "survival") {
      survivalRemaining = Math.max(0, survivalRemaining - dt);
      survivalCredit += dt * survivalLinesPerMinute() / 60000;
      const generated = Math.floor(survivalCredit);
      if (generated > 0) {
        survivalPendingRows += generated;
        survivalTotalLines += generated;
        survivalCredit -= generated;
      }
      if (survivalRemaining <= 0) {
        endMatch(true, "One minute survived. " + survivalTotalLines + " garbage lines generated.");
        return;
      }
    }
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
        if (!collides(player.board, player.current, player.current.x, player.current.y + 1)) {
          player.current.y++;
          player.current.lastRotate = false;
          player.current.allSpinCandidate = false;
          player.current.lastAction = "gravity";
        }
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
    if (x < 0 || x >= W || y < 0 || y >= H) return true;
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
    return frontCount === 2 || piece.kick === 3 ? "T-SPIN" : "MINI T-SPIN";
  }
  // TETR.IO-style All-Mini+ spin detection:
  // T pieces use the 3-corner rule, but an immobile T also counts as at least
  // a mini. Other pieces count as all-spins when they are immobile after
  // rotating. All-spins keep the normal clear attack value.
  function canMoveSpinPiece(board, piece, dx, dy) {
    // Use the same collision rules as normal movement. In particular, the
    // spawn buffer above row zero is open, not a solid ceiling.
    return !collides(board, piece, piece.x + dx, piece.y + dy, piece.rot);
  }
  function isImmobileSpinPosition(board, piece) {
    return !canMoveSpinPiece(board, piece, -1, 0)
      && !canMoveSpinPiece(board, piece, 1, 0)
      && !canMoveSpinPiece(board, piece, 0, -1)
      && !canMoveSpinPiece(board, piece, 0, 1);
  }
  function classifySpin(piece, board) {
    if (!piece.lastRotate) return "—";

    // T-spins use the 3-corner test at lock; a qualifying kick upgrades a mini.
    const tSpin = piece.type === "T" ? classifyTSpin(piece, board) : "—";
    if (tSpin !== "—") return tSpin;

    // An all-spin must be created by the rotation itself. Checking only at lock
    // wrongly turns an ordinary hard-dropped placement into a spin.
    if (piece.allSpinCandidate) return piece.type === "T" ? "MINI T-SPIN" : "ALL-SPIN";
    return "—";
  }
  // Tetris 99-style base garbage and combo bonuses.
  // Combo 0 is the first consecutive line clear; combo 1 is the second.
  const COMBO_ATTACK = [0,1,1,2,2,3,3,4,4,4,5];
  function attackFor(lines, spin, combo, b2bBonus) {
    let base = [0,0,1,2,4][lines] || 0;
    if (spin === "T-SPIN") base = [0,2,4,6,0][lines] || 0;
    if (spin === "MINI T-SPIN") base = [0,0,1,0,0][lines] || 0;
    // All-spins retain the game's normal line-clear attack value.
    const comboBonus = combo >= 0 ? COMBO_ATTACK[Math.min(combo, 10)] : 0;
    return Math.max(0, base + comboBonus + b2bBonus);
  }
  function scoreFor(lines, spin, level, b2b = false, allClear = false) {
    const normal = [0,100,300,500,800][lines] || 0;
    const full = [400,800,1200,1600,2600][lines] || 0;
    const mini = [100,200,400,800,1600][lines] || 0;
    let points = normal;
    if (spin === "T-SPIN") points = full || 400;
    else if (spin === "MINI T-SPIN" || spin === "ALL-SPIN") points = mini || 100;
    if (b2b && lines > 0) points *= 1.5;
    if (allClear) points += 3500;
    return Math.floor(points * level);
  }
  function lockPlayer() {
    if (!player.alive) return;
    const piece = clonePiece(player.current);
    const spin = classifySpin(piece, player.board);
    if (!mergePiece(player.board, piece)) {
      playerTopOut();
      return;
    }
    const cleared = clearLines(player.board);
    player.pieces++;
    player.holdUsed = false;
    player.spin = spin;
    const clearLabel = clearLabelFor(cleared, spin);
    if (clearLabel) showClearPopup(clearLabel);
    player.lastMove = spin !== "—" ? spin + (cleared ? " " + cleared + " LINE" + (cleared > 1 ? "S" : "") : "") : (cleared ? "LINE CLEAR ×" + cleared : "LOCK");
    const difficult = (spin !== "—" && cleared > 0) || cleared === 4;
    const wasB2B = difficult && player.b2b > 0;
    const b2bBonus = difficult ? player.b2b : 0;
    if (cleared > 0) player.combo++;
    else player.combo = -1;
    if (difficult) player.b2b++;
    else if (cleared > 0) player.b2b = 0;
    const attack = attackFor(cleared, spin, player.combo, b2bBonus);
    const nextLevel = 1 + Math.floor((player.lines + cleared) / 10);
    const allClear = cleared > 0 && player.board.every((row) => row.every((cell) => !cell));
    player.score += scoreFor(cleared, spin, nextLevel, wasB2B, allClear)
      + (cleared ? player.combo * 50 * nextLevel : 0);
    player.lines += cleared;
    player.level = nextLevel;
    const unblockedAttack = cancelIncoming(player, attack);
    const cancelledAttack = player.lastCancelled || 0;
    if (cleared > 0 && currentMode !== "survival") {
      if (unblockedAttack > 0 || cancelledAttack === 0) showBoardPopup("attack", unblockedAttack);
      if (cancelledAttack > 0) showBoardPopup("cancel", cancelledAttack);
    }
    if (unblockedAttack && currentMode !== "survival") sendPlayerAttack(unblockedAttack);
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
    if (!ended && currentMode === "sprint" && player.lines >= 40) endMatch(true, "40 lines cleared in " + formatTime(runElapsed) + ".");
    else if (!ended && currentMode === "cheese" && player.lines >= 100) endMatch(true, "100 lines cleared. You conquered the cheese stack.");
    else if (collides(player.board, player.current)) playerTopOut();
    else if (!ended && currentMode === "survival") survivalApplyNextFrame = true;
    updateUI(true);
  }
  function clearLabelFor(lines, spin) {
    const lineLabels = ["", "SINGLE", "DOUBLE", "TRIPLE", "TETRIS"];
    if (spin !== "—") return spin + (lines > 0 ? " " + (lineLabels[lines] || (lines + " LINES")) : "");
    return lines > 0 ? (lineLabels[lines] || (lines + " LINES")) : "";
  }
  function showClearPopup(message) {
    const popup = $("clearPopup");
    popup.textContent = message;
    popup.classList.add("visible");
    clearPopupRemaining = 2000;
  }
  function showBoardPopup(kind, amount) {
    const popup = $(kind === "cancel" ? "cancelPopup" : "attackPopup");
    popup.textContent = kind === "cancel" ? "−" + amount : String(amount);
    popup.style.left = (18 + Math.random() * 64).toFixed(1) + "%";
    popup.style.top = (64 + Math.random() * 23).toFixed(1) + "%";
    popup.classList.remove("visible");
    popup.classList.add("visible");
    if (kind === "cancel") cancelPopupRemaining = 2000;
    else attackPopupRemaining = 2000;
  }
  function showBotBoardPopup(bot, kind, amount) {
    const popup = $(kind === "cancel" ? "botCancelPopup" : "botAttackPopup");
    popup.textContent = kind === "cancel" ? "−" + amount : String(amount);
    popup.style.left = (18 + Math.random() * 64).toFixed(1) + "%";
    popup.style.top = (64 + Math.random() * 23).toFixed(1) + "%";
    popup.classList.remove("visible");
    popup.classList.add("visible");
    bot[kind === "cancel" ? "cancelPopupRemaining" : "attackPopupRemaining"] = 2000;
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
    state.lastCancelled = amount - remaining;
    return remaining;
  }
  function enqueueGarbage(target, amount) {
    if (!target.alive || amount <= 0) return;
    let hole = Math.floor(Math.random() * W);
    if (Number.isInteger(target.lastGarbageHole)) {
      while (hole === target.lastGarbageHole) hole = Math.floor(Math.random() * W);
    }
    target.lastGarbageHole = hole;
    // One attack is one packet: all of its rows share one well.
    // A separate attack receives a different well.
    for (let i = 0; i < amount; i++) target.incoming.push(hole);
    if (target.incomingClock < 500) target.incomingClock = 650;
  }
  function processGarbage(state, dt, isPlayer) {
    if (!state.alive || !state.incoming.length) return;
    state.incomingClock -= dt;
    if (state.incomingClock > 0) return;
    const hole = state.incoming.shift();
    const removed = state.board.shift();
    state.board.push(Array.from({ length: W }, (_, x) => x === hole ? null : "G"));
    state.dirty = true;
    if (isPlayer && player.current) {
      // Raise the active piece with the field. Otherwise a rising garbage row
      // can be inserted through a piece that has been soft-dropped near the floor.
      player.current.y--;
      player.current.lastRotate = false;
      player.current.allSpinCandidate = false;
      player.current.lastAction = "garbage-rise";
      lockClock = 0;
    }
    if (removed.some(Boolean)) {
      if (isPlayer) playerTopOut();
      else {
        state.alive = false;
        stopColdClearBot(state);
      }
      return;
    }
    if (!isPlayer) restartColdClearBot(state);
    state.incomingClock = 310;
    if (isPlayer) {
      shake = Math.max(shake, 3);
      spawnParticles(150, 560, 8, COLORS.G);
      logEvent("GARBAGE RECEIVED  ·  " + state.incoming.length + " LEFT", "danger");
    }
  }
  function applySurvivalBurst() {
    if (currentMode !== "survival" || !player.alive || ended) return;
    const amount = survivalPendingRows;
    survivalPendingRows = 0;
    if (amount <= 0) return;

    let hole = Math.floor(Math.random() * W);
    if (Number.isInteger(survivalLastHole)) {
      while (hole === survivalLastHole) hole = Math.floor(Math.random() * W);
    }
    survivalLastHole = hole;

    // A Survival packet is delivered atomically: every row is inserted on
    // this frame and shares one clean garbage well, rather than rising over
    // the normal timed garbage animation.
    for (let i = 0; i < amount; i++) {
      const removed = player.board.shift();
      player.board.push(Array.from({ length: W }, (_, x) => x === hole ? null : "G"));
      if (removed.some(Boolean)) {
        playerTopOut();
        return;
      }
    }

    player.dirty = true;
    shake = Math.max(shake, Math.min(11, 3 + amount));
    spawnParticles(150, 560, Math.min(24, 7 + amount * 2), COLORS.G);
    logEvent("GARBAGE BURST  ·  +" + amount + " LINES", "danger");
    updateUI(true);
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

  const COLD_CLEAR_SHAPES = {
    I: [[-1,0],[0,0],[1,0],[2,0]],
    O: [[0,0],[1,0],[0,1],[1,1]],
    T: [[-1,0],[0,0],[1,0],[0,1]],
    L: [[-1,0],[0,0],[1,0],[1,1]],
    J: [[-1,0],[0,0],[1,0],[-1,1]],
    S: [[-1,0],[0,0],[0,1],[1,1]],
    Z: [[-1,1],[0,1],[0,0],[1,0]]
  };

  function coldClearField(board) {
    // Cold Clear stores row zero at the floor and has a 40-row field.
    return Array.from({ length: 40 }, (_, y) => {
      if (y >= H) return Array(W).fill(false);
      return board[H - 1 - y].map(Boolean);
    });
  }
  function coldClearStartMessage(bot) {
    return {
      type: "start",
      epoch: bot.engineEpoch,
      board: coldClearField(bot.board),
      queue: [bot.current.type, ...bot.queue],
      hold: bot.hold || null,
      combo: Math.max(0, bot.combo + 1),
      back_to_back: bot.b2b > 0,
      max_nodes: bot.maxNodes
    };
  }
  function postColdClear(bot, message) {
    if (!bot.engineWorker) return false;
    try {
      bot.engineWorker.postMessage(JSON.stringify(message));
      return true;
    } catch (error) {
      bot.engineError = String(error);
      return false;
    }
  }
  function requestColdClearMove(bot) {
    if (!bot.alive || !bot.engineWorker || !bot.engineReady ||
        bot.enginePending || bot.readyMove || bot.engineError) return;
    const requestId = ++bot.requestSequence;
    bot.enginePending = true;
    postColdClear(bot, {
      type: "suggest",
      epoch: bot.engineEpoch,
      request_id: requestId
    });
  }
  function startColdClearBot(bot) {
    if (!bot || !bot.alive) return;
    stopColdClearBot(bot);
    bot.engineEpoch++;
    bot.engineReady = false;
    bot.enginePending = false;
    bot.readyMove = null;
    bot.engineError = "";
    try {
      const worker = new Worker("/cold-clear/main-worker.js");
      bot.engineWorker = worker;
      worker.onmessage = (event) => {
        let message;
        try {
          message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        } catch (error) {
          bot.engineError = "Invalid response from Cold Clear: " + String(error);
          return;
        }
        if (!message || typeof message !== "object") return;
        if (message.type === "ready") {
          bot.engineReady = true;
          requestColdClearMove(bot);
        } else if (message.type === "suggestion") {
          bot.enginePending = false;
          if (message.epoch !== bot.engineEpoch) {
            // A board reset superseded this search. Wait until the restarted
            // engine signals ready, then ask it for a fresh placement.
            if (bot.engineReady) requestColdClearMove(bot);
            return;
          }
          bot.readyMove = message;
        } else if (message.type === "dead") {
          bot.enginePending = false;
          if (message.epoch === bot.engineEpoch) {
            bot.engineError = "Cold Clear could not find a legal placement.";
          }
        } else if (message.type === "error") {
          bot.enginePending = false;
          bot.engineReady = false;
          bot.engineError = message.message || "Cold Clear failed.";
          console.error("Cold Clear:", bot.engineError);
          logEvent("COLD CLEAR ERROR  ·  " + bot.engineError, "danger");
        }
      };
      worker.onerror = (event) => {
        bot.enginePending = false;
        bot.engineReady = false;
        bot.engineError = event.message || "Cold Clear worker failed to load.";
        console.error("Cold Clear worker error:", event);
        logEvent("COLD CLEAR WORKER FAILED TO LOAD", "danger");
      };
      postColdClear(bot, coldClearStartMessage(bot));
    } catch (error) {
      bot.engineError = "Cold Clear could not start: " + String(error);
      console.error("Cold Clear startup failed:", error);
    }
  }
  function restartColdClearBot(bot) {
    if (!bot.engineWorker || !bot.alive) return;
    bot.engineEpoch++;
    bot.engineReady = false;
    bot.readyMove = null;
    postColdClear(bot, coldClearStartMessage(bot));
  }
  function stopColdClearBot(bot) {
    if (!bot || !bot.engineWorker) return;
    try { bot.engineWorker.postMessage(JSON.stringify({ type: "quit" })); } catch (_) {}
    bot.engineWorker.terminate();
    bot.engineWorker = null;
    bot.engineReady = false;
    bot.enginePending = false;
    bot.readyMove = null;
  }
  function takeBotNext(bot) {
    const before = bot.queue.length;
    const piece = takeNext(bot);
    const remainingBeforeRefill = before - 1;
    if (bot.queue.length > remainingBeforeRefill) {
      for (const type of bot.queue.slice(remainingBeforeRefill)) {
        postColdClear(bot, { type: "new_piece", piece: type });
      }
    }
    return piece;
  }
  function coldClearCells(move) {
    const base = COLD_CLEAR_SHAPES[move.piece];
    if (!base) return null;
    const rotation = move.orientation;
    const points = base.map(([dx, dy]) => {
      let rx = dx, ry = dy;
      if (rotation === "east") [rx, ry] = [dy, -dx];
      else if (rotation === "south") [rx, ry] = [-dx, -dy];
      else if (rotation === "west") [rx, ry] = [-dy, dx];
      return [move.x + rx, H - 1 - (move.y + ry)];
    });
    return points;
  }
  function botPlacementError(bot, message) {
    bot.engineError = message;
    bot.readyMove = null;
    bot.enginePending = false;
    console.error("Cold Clear placement rejected:", message);
    logEvent("COLD CLEAR PLACEMENT ERROR", "danger");
  }

  function botStep(bot) {
    if (!bot.alive || !bot.readyMove) return;
    const best = bot.readyMove;
    bot.readyMove = null;

    // Cold Clear can choose hold as part of its search. Mirror that operation
    // in the visible bot state before applying the returned landing position.
    if (best.hold) {
      if (bot.hold) {
        const heldPiece = bot.hold;
        bot.hold = bot.current.type;
        bot.current = makePiece(heldPiece);
      } else {
        bot.hold = bot.current.type;
        bot.current = takeBotNext(bot);
      }
    }
    if (best.piece !== bot.current.type) {
      botPlacementError(bot, "The selected piece did not match the active queue.");
      restartColdClearBot(bot);
      return;
    }

    const cells = coldClearCells(best);
    if (!cells || cells.length !== 4) {
      botPlacementError(bot, "Cold Clear returned an unsupported piece placement.");
      return;
    }
    const nextBoard = cloneBoard(bot.board);
    for (const [x, y] of cells) {
      if (x < 0 || x >= W || y < 0 || y >= H) {
        bot.alive = false;
        stopColdClearBot(bot);
        return;
      }
      if (nextBoard[y][x]) {
        botPlacementError(bot, "Cold Clear returned a placement that overlaps the game board.");
        restartColdClearBot(bot);
        return;
      }
      nextBoard[y][x] = best.piece;
    }

    const spin = best.spin === "full" ? "T-SPIN"
      : best.spin === "mini" ? "MINI T-SPIN" : "—";
    const lines = clearLines(nextBoard);
    const difficult = (spin !== "—" && lines > 0) || lines === 4;
    const wasB2B = difficult && bot.b2b > 0;
    const b2bBonus = difficult ? bot.b2b : 0;
    if (lines > 0) bot.combo++;
    else bot.combo = -1;
    if (difficult) bot.b2b++;
    else if (lines > 0) bot.b2b = 0;
    const attack = attackFor(lines, spin, bot.combo, b2bBonus);

    bot.board = nextBoard;
    bot.dirty = true;
    bot.lines += lines;
    bot.levelScore = 1 + Math.floor(bot.lines / 10);
    bot.pieces++;
    const allClear = lines > 0 && nextBoard.every((row) => row.every((cell) => !cell));
    bot.score += scoreFor(lines, spin, bot.levelScore, wasB2B, allClear)
      + (lines ? bot.combo * 50 * bot.levelScore : 0);

    const clearMessage = clearLabelFor(lines, spin);
    if (clearMessage) {
      const popup = $("botClearPopup");
      popup.textContent = clearMessage;
      popup.classList.add("visible");
      bot.clearPopupRemaining = 2000;
    }
    const unblockedAttack = cancelIncoming(bot, attack);
    const cancelled = attack - unblockedAttack;
    if (cancelled > 0) showBotBoardPopup(bot, "cancel", cancelled);
    if (unblockedAttack > 0) {
      sendBotAttack(bot, unblockedAttack);
      showBotBoardPopup(bot, "attack", unblockedAttack);
    }
    if (lines && Math.random() < 0.4) logEvent("OPPONENT CLEARED " + lines + " LINES.", "muted");

    bot.current = takeBotNext(bot);
    if (collides(bot.board, bot.current)) {
      bot.alive = false;
      stopColdClearBot(bot);
    } else {
      requestColdClearMove(bot);
    }
  }
  function updateBots(dt) {
    if (currentMode !== "botplay" || !bots.length || ended) return;
    for (const bot of bots) {
      if (!bot.alive) continue;
      processGarbage(bot, dt, false);
      if (!bot.alive) continue;
      for (const [timer, id] of [["clearPopupRemaining","botClearPopup"],["attackPopupRemaining","botAttackPopup"],["cancelPopupRemaining","botCancelPopup"]]) {
        if (bot[timer] > 0) {
          bot[timer] = Math.max(0, bot[timer] - dt);
          if (bot[timer] === 0) $(id).classList.remove("visible");
        }
      }
      // The search runs off-thread. This independent clock sets the bot's
      // in-game speed and prevents fast searches from locking faster than its tier.
      bot.clock = Math.min(bot.pace, bot.clock + dt);
      if (bot.clock >= bot.pace && bot.readyMove) {
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
    if (clearPopupRemaining > 0) {
      clearPopupRemaining = Math.max(0, clearPopupRemaining - dt);
      if (clearPopupRemaining === 0) $("clearPopup").classList.remove("visible");
    }
    if (attackPopupRemaining > 0) {
      attackPopupRemaining = Math.max(0, attackPopupRemaining - dt);
      if (attackPopupRemaining === 0) $("attackPopup").classList.remove("visible");
    }
    if (cancelPopupRemaining > 0) {
      cancelPopupRemaining = Math.max(0, cancelPopupRemaining - dt);
      if (cancelPopupRemaining === 0) $("cancelPopup").classList.remove("visible");
    }
    if (player) player.attackFlash = Math.max(0, player.attackFlash - dt);
  }
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function drawSkinBlock(ctx,px,py,size,color) {
    ctx.save();
    const skin = color === COLORS.G ? "classic" : pieceSkin;
    const x=px+1.3,y=py+1.3,w=size-2.6,h=size-2.6;
    if (skin === "flat") {
      ctx.fillStyle=color; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle="rgba(4,10,18,.24)"; ctx.lineWidth=1;
      ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    } else if (skin === "glass") {
      ctx.fillStyle=color; ctx.globalAlpha=.78; ctx.fillRect(x,y,w,h);
      ctx.globalAlpha=.9; ctx.fillStyle="rgba(255,255,255,.25)";
      ctx.fillRect(x+1,y+1,w-2,Math.max(2,size*.22));
      ctx.strokeStyle="rgba(235,248,255,.62)"; ctx.lineWidth=1;
      ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    } else if (skin === "neon") {
      ctx.fillStyle="rgba(7,14,27,.94)"; ctx.fillRect(x,y,w,h);
      ctx.shadowColor=color; ctx.shadowBlur=Math.max(4,size*.24);
      ctx.strokeStyle=color; ctx.lineWidth=Math.max(1.4,size*.09);
      ctx.strokeRect(x+1,y+1,w-2,h-2); ctx.shadowBlur=0;
      ctx.fillStyle=color; ctx.globalAlpha=.22; ctx.fillRect(x+3,y+3,w-6,h-6); ctx.globalAlpha=1;
    } else {
      ctx.fillStyle=color; ctx.fillRect(x,y,w,h);
      ctx.fillStyle="rgba(255,255,255,.12)"; ctx.fillRect(px+2,py+2,size-4,1.3);
      ctx.fillStyle="rgba(0,0,0,.13)"; ctx.fillRect(px+2,py+size-3.2,size-4,1.2);
    }
    ctx.restore();
  }
  function drawCell(ctx,x,y,color,size,alpha=1,ghost=false) {
    const px=x*size,py=y*size;
    ctx.save(); ctx.globalAlpha=alpha;
    if (ghost) {
      ctx.fillStyle=color; ctx.globalAlpha=.13; ctx.fillRect(px+2,py+2,size-4,size-4);
      ctx.globalAlpha=.72*alpha; ctx.strokeStyle=color; ctx.lineWidth=1.3;
      ctx.strokeRect(px+2.5,py+2.5,size-5,size-5);
    } else drawSkinBlock(ctx,px,py,size,color);
    ctx.restore();
  }
  function drawBoard(canvas, board, active, small = false, effects = true) {
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
    if (!small && effects && particles.length) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
    if (!small && effects && lineFlash > 0) {
      ctx.fillStyle = "rgba(218,255,255," + (lineFlash / 180 * .13) + ")";
      ctx.fillRect(0, 0, cw, ch);
    }
    if (!small && effects && player && player.attackFlash > 0) {
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
      drawSkinBlock(ctx,startX+x*cell,startY+y*cell,cell,COLORS[type]);
    }
  }
  let previewCacheKey = null;
  let botPreviewCacheKey = null;
  function renderSkinPreview() {
    const canvas=$("skinPreview");
    if(!canvas) return;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const [x,y] of SHAPES.T[0]) drawSkinBlock(ctx,38+x*18,12+y*18,18,COLORS.T);
    ctx.fillStyle="rgba(190,210,235,.72)";
    ctx.font="9px monospace"; ctx.textAlign="center";
    ctx.fillText(pieceSkin.toUpperCase(),105,76);
  }
  function drawQueuePreview(canvas, queue) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < Math.min(5, queue.length); i++) {
      if (i > 0) {
        ctx.strokeStyle = "rgba(153,177,211,.09)";
        ctx.beginPath(); ctx.moveTo(11, i * 66); ctx.lineTo(129, i * 66); ctx.stroke();
      }
      const type = queue[i], cell = i === 0 ? 16 : 14;
      const shape = SHAPES[type][0];
      const minX = Math.min(...shape.map((v) => v[0]));
      const maxX = Math.max(...shape.map((v) => v[0]));
      const minY = Math.min(...shape.map((v) => v[1]));
      const maxY = Math.max(...shape.map((v) => v[1]));
      const px = (140 - (maxX - minX + 1) * cell) / 2 - minX * cell;
      const py = i * 66 + (60 - (maxY - minY + 1) * cell) / 2 - minY * cell;
      for (const [x,y] of shape) drawSkinBlock(ctx,px+x*cell,py+y*cell,cell,COLORS[type]);
    }
  }
  function renderPreviews() {
    if (!player) return;
    const key = pieceSkin + "|" + (player.hold || "-") + "|" + player.queue.slice(0, 5).join("");
    if (key === previewCacheKey) return;
    previewCacheKey = key;
    drawPreview($("holdCanvas"), player.hold, 0, 17);
    drawQueuePreview($("nextCanvas"), player.queue);
  }
  function renderBotPreviews() {
    if (!bots.length) return;
    const bot = bots[0];
    const key = pieceSkin + "|" + (bot.hold || "-") + "|" + bot.queue.slice(0, 5).join("");
    if (key === botPreviewCacheKey) return;
    botPreviewCacheKey = key;
    drawPreview($("botHoldCanvas"), bot.hold, 0, 17);
    drawQueuePreview($("botNextCanvas"), bot.queue);
  }
  let renderedStatsKey = "";
  function renderRunStats() {
    const container = $("runStats");
    const key = selectedStats.join("|");
    if (container.dataset.statsKey !== key) {
      container.textContent = "";
      for (const stat of selectedStats) {
        if (!STAT_INFO[stat]) continue;
        const pill = document.createElement("div");
        pill.className = "stat-pill";
        pill.dataset.stat = stat;
        const label = document.createElement("span");
        label.textContent = STAT_INFO[stat][0];
        const value = document.createElement("strong");
        value.textContent = "—";
        pill.append(label,value);
        container.append(pill);
      }
      container.dataset.statsKey = key;
    }
    for (const pill of container.querySelectorAll("[data-stat]")) {
      const data = STAT_INFO[pill.dataset.stat];
      if (data) pill.querySelector("strong").textContent = String(data[1]());
    }
  }
  function renderBotStats() {
    const container=$("botStats");
    if(!container || !bots.length) return;
    const bot=bots[0];
    const info={
      score:["SCORE",()=>bot.score.toLocaleString()],
      lines:["LINES",()=>bot.lines],
      time:["TIME",()=>formatTime(runElapsed)],
      level:["LEVEL",()=>bot.levelScore],
      combo:["COMBO",()=>bot.combo<0?"—":bot.combo+1],
      b2b:["B2B",()=>bot.b2b?"×"+bot.b2b:"—"],
      pieces:["PIECES",()=>bot.pieces],
      pps:["PPS",()=>(bot.pieces/Math.max(runElapsed/1000,.001)).toFixed(2)],
      apm:["APM",()=>(bot.sent*60000/Math.max(runElapsed,1000)).toFixed(1)],
      attack:["ATTACK",()=>bot.sent],
      incoming:["INCOMING",()=>bot.incoming.length]
    };
    const key=selectedStats.join("|");
    if(container.dataset.statsKey!==key){
      container.textContent="";
      for(const stat of selectedStats){
        if(!info[stat]) continue;
        const pill=document.createElement("div"); pill.className="stat-pill"; pill.dataset.stat=stat;
        const label=document.createElement("span"); label.textContent=info[stat][0];
        const value=document.createElement("strong"); value.textContent="—";
        pill.append(label,value); container.append(pill);
      }
      container.dataset.statsKey=key;
    }
    for(const pill of container.querySelectorAll("[data-stat]")){
      const item=info[pill.dataset.stat];
      if(item) pill.querySelector("strong").textContent=String(item[1]());
    }
  }
  function renderAll(forceStats = false) {
    if (!player) return;
    const frame = $("boardFrame");
    if (frame) frame.style.transform = shake > 0
      ? "translate(" + ((Math.random() - .5) * shake) + "px," + ((Math.random() - .5) * shake) + "px)" : "";
    drawBoard($("playerBoard"),player.board,player.current,false);
    if (bots.length && bots[0].dirty) {
      drawBoard($("botBoard0"),bots[0].board,bots[0].current,false,false);
      bots[0].dirty=false;
    }
    renderPreviews();
    renderBotPreviews();
    updateUI(forceStats);
  }
  function updateUI(forceStats = false) {
    if (!player) return;
    const now = performance.now();
    // Keep game rendering at refresh rate, but update secondary HUD text at 10 Hz.
    if (forceStats || now - lastUiAt >= 100) {
      renderRunStats();
      renderBotStats();
      lastUiAt = now;
    }
    $("comboCount").textContent = "×" + Math.max(0, player.combo + 1);
    $("comboHud").classList.toggle("active", player.combo >= 0);
    $("holdHint").textContent = player.hold ? "READY TO SWAP" : "EMPTY";
    if (bots.length) {
      const bot = bots[0];
      $("botComboCount").textContent = "×" + Math.max(0, bot.combo + 1);
      $("botComboHud").classList.toggle("active", bot.combo >= 0);
      $("botHoldHint").textContent = bot.hold ? "READY TO SWAP" : "EMPTY";
      $("botSpeedLabel").textContent = bot.targetPPS.toFixed(2) + " PPS";
      $("botState0").textContent = bot.engineError ? "ENGINE ERROR" : !bot.alive ? "TOPPED OUT" : !bot.engineReady ? "LOADING COLD CLEAR" : started ? "RUN IN PROGRESS" : "READY";
      $("botRunObjective").textContent = "LEVEL " + selectedBotLevel + " · " + bot.rank;
    }
    $("speedLabel").textContent = currentMode === "survival"
      ? survivalLinesPerMinute() + " LINES / MIN"
      : (950 / gravityInterval(player.level)).toFixed(1) + "× GRAVITY";
    $("pauseButton").innerHTML = paused ? "▶ <span>RESUME</span>" : "Ⅱ <span>PAUSE</span>";
    $("battleStatus").textContent = ended ? "RUN COMPLETE" : paused ? "PAUSED"
      : currentMode === "botplay" && bots[0]?.engineError ? "COLD CLEAR ERROR"
      : currentMode === "botplay" && bots[0] && !bots[0].engineReady ? "LOADING COLD CLEAR"
      : started ? "RUN IN PROGRESS" : "READY";
    if (currentMode === "sprint") $("runObjective").textContent = "CLEAR " + Math.max(0, 40 - player.lines) + " MORE LINES";
    else if (currentMode === "cheese") $("runObjective").textContent = "DIG " + Math.max(0, 100 - player.lines) + " MORE LINES";
    else if (currentMode === "blitz") $("runObjective").textContent = "TIME LEFT · " + formatTime(blitzRemaining);
    else if (currentMode === "survival") $("runObjective").textContent = "SURVIVE · " + formatTime(survivalRemaining);
    else $("runObjective").textContent = bots[0]?.alive ? "OUTSTACK THE " + (bots[0]?.rank || "BOT") + " BOT" : "OPPONENT TOPPED OUT";
    $("boardObjective").textContent = currentMode === "sprint" ? String(Math.max(0,40-player.lines))
      : currentMode === "cheese" ? String(Math.max(0,100-player.lines))
      : currentMode === "blitz" ? formatTime(blitzRemaining).slice(0,5)
      : currentMode === "survival" ? formatTime(survivalRemaining).slice(0,5) : "";
    $("boardObjective").dataset.label = currentMode === "blitz" || currentMode === "survival" ? "TIME LEFT" : "LINES LEFT";
    $("boardObjective").classList.toggle("visible",currentMode !== "botplay");

  }
  function logEvent(message, tone) {
    // The playfield stays deliberately uncluttered; keep the latest event
    // in the status line rather than adding a combat feed to the game screen.
    const status = $("battleStatus");
    if (status && started && !paused) status.textContent = message.toUpperCase();
  }

  function loop(timestamp) {
    const dt = Math.min(50, timestamp - (lastFrame || timestamp));
    lastFrame = timestamp;
    if (survivalApplyNextFrame && started && !paused && !ended && currentMode === "survival") {
      survivalApplyNextFrame = false;
      applySurvivalBurst();
    }
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
  function renderStatsSettings() {
    document.querySelectorAll("#statOptions input").forEach((input) => {
      input.checked = selectedStats.includes(input.value);
    });
    renderRunStats();
  }
  function saveStatsSettings() {
    selectedStats = [...document.querySelectorAll("#statOptions input:checked")].map((input) => input.value);
    try { localStorage.setItem("stacklab-visible-stats", JSON.stringify(selectedStats)); } catch (_) {}
    renderRunStats();
  }
  function leaveToMenu() {
    started = false;
    paused = false;
    survivalApplyNextFrame = false;
    held.clear();
    shift.dir = 0;
    $("pauseOverlay").classList.add("hidden");
    $("resultOverlay").classList.add("hidden");
    showPage("homePage");
  }
  function openSettings() {
    showPage("settingsPage");
    updateSliderUI();
    renderKeybinds();
    renderStatsSettings();
    $("pieceSkinSelect").value=pieceSkin;
    renderSkinPreview();
  }
  $("openSingleplayer").addEventListener("click", () => {
    updateModeScreen();
    showPage("singleplayerPage");
  });
  $("openSettings").addEventListener("click", openSettings);
  $("brandHome").addEventListener("click", (event) => { event.preventDefault(); leaveToMenu(); });
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  document.querySelectorAll(".mode-card").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode;
      updateModeScreen();
    });
  });
  document.querySelectorAll("[data-bot-level]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedBotLevel = Number(button.dataset.botLevel);
      updateModeScreen();
    });
  });
  document.querySelectorAll("[data-survival-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSurvivalDifficulty = Number(button.dataset.survivalDifficulty);
      updateModeScreen();
    });
  });
  $("startSelectedMode").addEventListener("click", beginSelectedMode);
  $("gameMenuButton").addEventListener("click", leaveToMenu);
  $("restartButton").addEventListener("click", () => resetMatch(true));
  $("pauseButton").addEventListener("click", togglePause);
  $("resumeButton").addEventListener("click", togglePause);
  $("pauseRestartButton").addEventListener("click", () => resetMatch(true));
  $("pauseMenuButton").addEventListener("click", leaveToMenu);
  $("retryGame").addEventListener("click", () => resetMatch(true));
  $("resultMenuButton").addEventListener("click", leaveToMenu);

  $("dasSlider").addEventListener("input", (event) => { settings.das = Number(event.target.value); saveSettings(); });
  $("arrSlider").addEventListener("input", (event) => { settings.arr = Number(event.target.value); saveSettings(); });
  $("sdfSlider").addEventListener("input", (event) => { settings.sdf = Number(event.target.value); saveSettings(); });
  $("dasCancel").addEventListener("change", (event) => { settings.dasCancel = event.target.checked; saveSettings(); });
  document.querySelectorAll("#statOptions input").forEach((input) => input.addEventListener("change", saveStatsSettings));
  $("pieceSkinSelect").addEventListener("change",(event) => {
    pieceSkin=event.target.value;
    try { localStorage.setItem("stacklab-piece-skin",pieceSkin); } catch (_) {}
    previewCacheKey=null;
    renderSkinPreview();
    renderPreviews();
    renderAll();
  });
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
    if (action === "start" && !started) {
      if (currentPage === "homePage") { updateModeScreen(); showPage("singleplayerPage"); }
      else if (currentPage === "singleplayerPage") beginSelectedMode();
      else if (currentPage === "gamePage" && ended) resetMatch(true);
      return;
    }
    if (action === "pause") { togglePause(); return; }
    if (action === "restart" && currentPage === "gamePage") { resetMatch(true); return; }
    if (currentPage !== "gamePage" || !started || paused) return;
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
      if (!started || currentPage !== "gamePage") return;
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
  updateModeScreen();
  resetMatch(false);
  renderStatsSettings();
  showPage("homePage");
  requestAnimationFrame(loop);
})();