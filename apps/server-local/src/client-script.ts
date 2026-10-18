export const browserClient = `(() => {
  "use strict";

  const PALETTE = [
    { id: "J1", name: "Jugador 1", hex: "#38bdf8", color: 0x38bdf8 },
    { id: "J2", name: "Jugador 2", hex: "#f43f5e", color: 0xf43f5e },
    { id: "J3", name: "Jugador 3", hex: "#a855f7", color: 0xa855f7 },
    { id: "J4", name: "Jugador 4", hex: "#22c55e", color: 0x22c55e },
    { id: "J5", name: "Jugador 5", hex: "#f59e0b", color: 0xf59e0b },
    { id: "J6", name: "Jugador 6", hex: "#ec4899", color: 0xec4899 }
  ];

  const role = location.pathname === "/admin"
    ? "director"
    : location.pathname === "/broadcast"
      ? "broadcast"
      : "player";

  let roleToken = "";
  if (role !== "player") {
    const hash = location.hash ? location.hash.slice(1) : "";
    const storageKey = "kevin.cap." + role;
    if (hash) {
      roleToken = hash;
      try { sessionStorage.setItem(storageKey, hash); } catch (_) {}
      try { history.replaceState(null, "", location.pathname); } catch (_) {}
    } else {
      try { roleToken = sessionStorage.getItem(storageKey) || ""; } catch (_) {}
    }
  }

  function formatTime(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  let ws = null;
  let messageCounter = 0;
  let nextSequence = 0;
  let currentMatchId = null;
  let myParticipantId = null;
  let myDisplayName = "";
  let lastKnownView = null;
  let lastKnownStatus = null;
  let lastKnownBroadcast = null;
  let isConnected = false;

  function send(type, fields) {
    if (!ws || ws.readyState !== 1) return;
    messageCounter += 1;
    const payload = Object.assign(
      { protocolVersion: 1, messageId: "c-" + messageCounter, type: type },
      fields || {}
    );
    ws.send(JSON.stringify(payload));
  }

  function getStoredSession() {
    try { return sessionStorage.getItem("kevin.session"); } catch (_) { return null; }
  }

  function setStoredSession(token) {
    try { sessionStorage.setItem("kevin.session", token); } catch (_) {}
  }

  function clearStoredSession() {
    try { sessionStorage.removeItem("kevin.session"); } catch (_) {}
    myParticipantId = null;
    nextSequence = 0;
  }

  function connectWs() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = proto + "//" + location.host + "/ws";
    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnected = true;
      updateConnectionIndicator(true);
      const accessPayload = { role: role };
      if (role !== "player" && roleToken) {
        accessPayload.token = roleToken;
      }
      send("room.access", accessPayload);
    };

    ws.onclose = () => {
      isConnected = false;
      updateConnectionIndicator(false);
      setText("status-banner", "Desconectado. Intentando reconectar...");
      setTimeout(connectWs, 2000);
    };

    ws.onerror = () => {
      /* ws.onclose gestiona la reconexión */
    };

    ws.onmessage = (event) => {
      let m;
      try { m = JSON.parse(event.data); } catch (_) { return; }
      handleServerMessage(m);
    };
  }

  function updateConnectionIndicator(online) {
    const dot = document.getElementById("conn-dot");
    if (dot) {
      dot.className = "color-dot " + (online ? "status-green" : "status-red");
      dot.title = online ? "Conectado al servidor" : "Desconectado";
    }
  }

  function handleServerMessage(m) {
    switch (m.type) {
      case "room.accessed":
        onRoomAccessed();
        break;
      case "player.joined":
        onPlayerJoined(m);
        break;
      case "match.status":
        onMatchStatus(m.status);
        break;
      case "player.view":
        onPlayerView(m.view);
        break;
      case "match.finished":
        onMatchFinished(m.status);
        break;
      case "broadcast.state":
        onBroadcastState(m.state);
        break;
      case "error":
        onError(m);
        break;
    }
  }

  function onRoomAccessed() {
    if (role === "player") {
      const savedToken = getStoredSession();
      if (savedToken) {
        send("player.reconnect", { token: savedToken });
      }
    }
    setText("status-banner", "Conectado");
  }

  function onPlayerJoined(msg) {
    myParticipantId = msg.participantId;
    nextSequence = msg.nextSequence;
    currentMatchId = msg.matchId;
    setStoredSession(msg.reconnectToken);
    showPlayerLobbyOrGame();
  }

  function onMatchStatus(status) {
    lastKnownStatus = status;
    if (currentMatchId && currentMatchId !== status.matchId) {
      clearStoredSession();
      currentMatchId = status.matchId;
      lastKnownView = null;
      if (role === "player") {
        showPlayerJoinScreen();
      }
    } else if (!currentMatchId) {
      currentMatchId = status.matchId;
    }

    updatePhaseAndTimer(status);
    updateParticipantsList(status.participants);

    if (role === "director") {
      updateDirectorControls(status);
    }
  }

  function onPlayerView(view) {
    lastKnownView = view;
    renderPlayerCanvas(view);
    updatePlayerHud(view);
  }

  function onMatchFinished(status) {
    lastKnownStatus = status;
    updatePhaseAndTimer(status);
    showFinishedScreen(status);
  }

  function onBroadcastState(state) {
    lastKnownBroadcast = state;
    lastKnownStatus = state.summary;
    updatePhaseAndTimer(state.summary);
    updateParticipantsList(state.summary.participants);

    if (role === "director") {
      updateDirectorControls(state.summary);
      renderBroadcastCanvas("director-canvas", state);
    } else if (role === "broadcast") {
      renderBroadcastCanvas("obs-canvas", state);
      updateObsParticipantCards(state);
      if (state.summary.phase === "finished") {
        showBroadcastWinner(state.summary);
      } else {
        const winEl = document.getElementById("broadcast-winner-banner");
        if (winEl) winEl.hidden = true;
      }
    }
  }

  function onError(m) {
    const errorBox = document.getElementById("error-banner");
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = "Aviso: " + (m.message || m.code);
      setTimeout(() => { errorBox.hidden = true; }, 4000);
    }

    if (["INVALID_SESSION", "UNKNOWN_PLAYER", "RECONNECT_EXPIRED", "ROOM_FULL"].includes(m.code)) {
      clearStoredSession();
      if (role === "player") {
        showPlayerJoinScreen();
      }
    }

    if (m.code === "UNAUTHORIZED" && (role === "director" || role === "broadcast")) {
      const authError = document.getElementById("unauth-screen");
      if (authError) authError.hidden = false;
      const mainShell = document.getElementById("authorized-content");
      if (mainShell) mainShell.hidden = true;
    }
  }

  function updatePhaseAndTimer(summary) {
    const phase = summary.phase;
    const badge = document.getElementById("phase-badge");
    if (badge) {
      badge.className = "badge phase-" + phase;
      const labels = {
        waiting: "En espera",
        countdown: "Cuenta regresiva",
        running: "En carrera",
        finished: "Finalizada"
      };
      badge.textContent = labels[phase] || phase;
    }

    const timerVal = phase === "countdown" ? summary.countdownMs : summary.remainingMs;
    const timerText = phase === "countdown"
      ? String(Math.max(1, Math.ceil(summary.countdownMs / 1000)))
      : formatTime(timerVal);

    setText("timer-display", timerText);
    setText("obs-timer", timerText);

    const countdownOverlay = document.getElementById("countdown-overlay");
    if (countdownOverlay) {
      if (phase === "countdown") {
        countdownOverlay.hidden = false;
        setText("countdown-number", String(Math.max(1, Math.ceil(summary.countdownMs / 1000))));
      } else {
        countdownOverlay.hidden = true;
      }
    }

    if (role === "player") {
      if (phase === "waiting") {
        if (!myParticipantId) {
          showPlayerJoinScreen();
        } else {
          showPlayerLobbyScreen();
        }
      } else if (phase === "countdown" || phase === "running") {
        showPlayerGameScreen();
      } else if (phase === "finished") {
        showFinishedScreen(summary);
      }
    }
  }

  function showPlayerJoinScreen() {
    const sJoin = document.getElementById("player-join-screen");
    const sLobby = document.getElementById("player-lobby-screen");
    const sGame = document.getElementById("player-game-view");
    const sFinished = document.getElementById("player-finished-overlay");
    if (sJoin) sJoin.hidden = false;
    if (sLobby) sLobby.hidden = true;
    if (sGame) sGame.hidden = true;
    if (sFinished) sFinished.hidden = true;
  }

  function showPlayerLobbyScreen() {
    const sJoin = document.getElementById("player-join-screen");
    const sLobby = document.getElementById("player-lobby-screen");
    const sGame = document.getElementById("player-game-view");
    const sFinished = document.getElementById("player-finished-overlay");
    if (sJoin) sJoin.hidden = true;
    if (sLobby) sLobby.hidden = false;
    if (sGame) sGame.hidden = true;
    if (sFinished) sFinished.hidden = true;
  }

  function showPlayerGameScreen() {
    const sJoin = document.getElementById("player-join-screen");
    const sLobby = document.getElementById("player-lobby-screen");
    const sGame = document.getElementById("player-game-view");
    const sFinished = document.getElementById("player-finished-overlay");
    if (sJoin) sJoin.hidden = true;
    if (sLobby) sLobby.hidden = true;
    if (sGame) sGame.hidden = false;
    if (sFinished) sFinished.hidden = true;

    const canvas = document.getElementById("player-canvas");
    if (canvas && syncCanvasBitmapSize(canvas) && lastKnownView) {
      renderPlayerCanvas(lastKnownView);
    }
  }

  function showPlayerLobbyOrGame() {
    if (!lastKnownStatus) {
      showPlayerLobbyScreen();
      return;
    }
    if (lastKnownStatus.phase === "running" || lastKnownStatus.phase === "countdown") {
      showPlayerGameScreen();
    } else {
      showPlayerLobbyScreen();
    }
  }

  function showFinishedScreen(summary) {
    if (role === "player") {
      const sFinished = document.getElementById("player-finished-overlay");
      if (sFinished) sFinished.hidden = false;

      const title = document.getElementById("player-result-title");
      const desc = document.getElementById("player-result-desc");

      if (summary.winnerId && summary.winnerId === myParticipantId) {
        if (title) title.textContent = "¡VICTORIA! ¡ENCONTRASTE A KEVIN!";
        if (desc) desc.textContent = "Has alcanzado la casilla de Kevin antes que los demás participantes.";
      } else if (summary.winnerId) {
        const winner = (summary.participants || []).find(p => p.id === summary.winnerId);
        const name = winner ? winner.displayName : "Un jugador";
        if (title) title.textContent = "¡Carrera Finalizada!";
        if (desc) desc.textContent = name + " ha encontrado a Kevin.";
      } else {
        if (title) title.textContent = "¡Tiempo Agotado!";
        if (desc) desc.textContent = "Ningún participante logró encontrar a Kevin dentro del tiempo límite.";
      }

      renderResultsTable("player-results-body", summary);
    }
  }

  function renderResultsTable(tbodyId, summary) {
    const tbody = document.getElementById(tbodyId);
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const results = summary.results || [];
    results.forEach((r, idx) => {
      const tr = document.createElement("tr");

      const tdPos = document.createElement("td");
      tdPos.textContent = String(idx + 1);
      tr.appendChild(tdPos);

      const tdName = document.createElement("td");
      const style = PALETTE[idx % PALETTE.length];
      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.backgroundColor = style.hex;
      dot.style.marginRight = "6px";
      tdName.appendChild(dot);
      tdName.appendChild(document.createTextNode(r.displayName));
      if (summary.winnerId === r.participantId) {
        const winBadge = document.createElement("span");
        winBadge.textContent = " 🏆";
        tdName.appendChild(winBadge);
      }
      tr.appendChild(tdName);

      const tdSteps = document.createElement("td");
      tdSteps.textContent = String(r.steps);
      tr.appendChild(tdSteps);

      const tdExplored = document.createElement("td");
      const pct = (r.exploredPercent * 100).toFixed(1);
      tdExplored.textContent = r.exploredCells + " (" + pct + "%)";
      tr.appendChild(tdExplored);

      tbody.appendChild(tr);
    });
  }

  function updateParticipantsList(participants) {
    const container = document.getElementById("participants-list");
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    const list = participants || [];
    setText("connected-count-badge", list.filter(p => p.connected).length + " / 6");

    list.forEach((p, idx) => {
      const style = PALETTE[idx % PALETTE.length];
      const item = document.createElement("div");
      item.className = "participant-item";

      const nameCol = document.createElement("div");
      nameCol.className = "participant-name-col";

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.backgroundColor = style.hex;
      nameCol.appendChild(dot);

      const nameSpan = document.createElement("span");
      nameSpan.textContent = p.displayName + (p.id === myParticipantId ? " (Tú)" : "");
      nameCol.appendChild(nameSpan);
      item.appendChild(nameCol);

      const statusBadge = document.createElement("span");
      if (!p.connected) {
        statusBadge.className = "badge status-disconnected";
        statusBadge.textContent = p.expired ? "Expirado" : "Desconectado";
      } else {
        statusBadge.className = "badge phase-running";
        statusBadge.textContent = "Conectado";
      }
      item.appendChild(statusBadge);

      container.appendChild(item);
    });
  }

  function updateDirectorControls(summary) {
    const startBtn = document.getElementById("admin-start-btn");
    const warningText = document.getElementById("admin-start-warning");
    const activeCount = (summary.participants || []).filter(p => p.connected).length;
    const canStart = summary.phase === "waiting" && activeCount >= 3;

    if (startBtn) {
      startBtn.disabled = !canStart;
    }
    if (warningText) {
      if (summary.phase !== "waiting") {
        warningText.textContent = "Carrera en curso o finalizada.";
      } else if (activeCount < 3) {
        warningText.textContent = "Se necesitan al menos 3 participantes conectados para iniciar (hay " + activeCount + ").";
      } else {
        warningText.textContent = "Listo para iniciar con " + activeCount + " participantes.";
      }
    }
  }

  function updatePlayerHud(view) {
    const totalCells = (view.columns || 0) * (view.rows || 0);
    const exploredCount = Array.isArray(view.explored) ? view.explored.length : 0;
    const exploredRatio = totalCells > 0 ? exploredCount / totalCells : 0;
    setText("hud-explored-pct", (exploredRatio * 100).toFixed(1) + "%");
    setText("hud-pos", "(" + view.position.column + ", " + view.position.row + ")");
    const kevinAlert = document.getElementById("kevin-seen-alert");
    if (kevinAlert) {
      kevinAlert.hidden = !view.kevin;
    }
  }

  function calculateViewport(width, height, cols, rows, padding) {
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const availW = Math.max(32, width - padding * 2);
    const availH = Math.max(32, height - padding * 2);
    const cellSize = Math.max(2, Math.floor(Math.min(availW / safeCols, availH / safeRows)));
    const mapW = cellSize * safeCols;
    const mapH = cellSize * safeRows;
    const offsetX = Math.floor((width - mapW) / 2);
    const offsetY = Math.floor((height - mapH) / 2);
    return { cellSize: cellSize, offsetX: offsetX, offsetY: offsetY, mapW: mapW, mapH: mapH };
  }

  /* Sincronización desacoplada del tamaño del bitmap sin alterar el contenedor CSS */
  function syncCanvasBitmapSize(canvas) {
    if (!canvas) return false;
    const container = canvas.parentElement;
    if (!container) return false;
    const rect = typeof container.getBoundingClientRect === "function" ? container.getBoundingClientRect() : null;
    const w = Math.floor((rect && rect.width) || container.clientWidth || 0);
    const h = Math.floor((rect && rect.height) || container.clientHeight || 0);
    if (w <= 0 || h <= 0) return false;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  function setupCanvasObserver(canvasId, redrawCallback) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    syncCanvasBitmapSize(canvas);

    if (typeof ResizeObserver !== "undefined") {
      let rafId = null;
      const ro = new ResizeObserver((entries) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            let w = 0;
            let h = 0;
            if (entry.contentRect) {
              w = Math.floor(entry.contentRect.width);
              h = Math.floor(entry.contentRect.height);
            }
            if (w <= 0 || h <= 0) {
              w = Math.floor(container.clientWidth || 0);
              h = Math.floor(container.clientHeight || 0);
            }
            if (w <= 0 || h <= 0) continue;

            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
              if (redrawCallback) redrawCallback();
            }
          }
        });
      });
      ro.observe(container);
    }
  }

  /* Renderizado de la vista privada del jugador */
  function renderPlayerCanvas(view) {
    const canvas = document.getElementById("player-canvas");
    if (!canvas) return;

    if (canvas.width <= 0 || canvas.height <= 0) {
      syncCanvasBitmapSize(canvas);
    }
    const w = canvas.width || 800;
    const h = canvas.height || 500;
    if (w <= 0 || h <= 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, w, h);

    const vp = calculateViewport(w, h, view.columns, view.rows, 12);
    const cs = vp.cellSize;
    const ox = vp.offsetX;
    const oy = vp.offsetY;

    // 1. Casillas en penumbra (memoria explorada)
    ctx.fillStyle = "#162238";
    const explored = view.explored || [];
    for (let i = 0; i < explored.length; i++) {
      const c = explored[i];
      if (c.terrain === "floor") {
        ctx.fillRect(ox + c.column * cs, oy + c.row * cs, cs, cs);
      } else {
        ctx.fillStyle = "#090e1a";
        ctx.fillRect(ox + c.column * cs, oy + c.row * cs, cs, cs);
        ctx.fillStyle = "#162238";
      }
    }

    // 2. Casillas iluminadas dentro de la linterna actual
    const visible = view.visible || [];
    for (let i = 0; i < visible.length; i++) {
      const c = visible[i];
      if (c.terrain === "floor") {
        ctx.fillStyle = "#2d405e";
        ctx.fillRect(ox + c.column * cs, oy + c.row * cs, cs, cs);
      } else {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(ox + c.column * cs, oy + c.row * cs, cs, cs);
      }
    }

    // 3. Aro indicador de la linterna circular (radio euclidiano 4)
    const px = ox + view.position.column * cs + cs / 2;
    const py = oy + view.position.row * cs + cs / 2;
    ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 4 * cs, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Kevin (SOLO si view.kevin está provisto por el servidor en visible)
    if (view.kevin) {
      const kx = ox + view.kevin.column * cs + cs / 2;
      const ky = oy + view.kevin.row * cs + cs / 2;
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(kx, ky, Math.max(3, cs * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#060a12";
      ctx.font = "bold " + Math.max(9, Math.floor(cs * 0.6)) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K", kx, ky);
    }

    // 5. Jugador (@)
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, cs * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Borde exterior del mapa
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, vp.mapW, vp.mapH);
  }

  /* Renderizado de la vista completa para OBS y Director */
  function renderBroadcastCanvas(canvasId, state) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (canvas.width <= 0 || canvas.height <= 0) {
      syncCanvasBitmapSize(canvas);
    }
    const w = canvas.width || 960;
    const h = canvas.height || 540;
    if (w <= 0 || h <= 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#060a12";
    ctx.fillRect(0, 0, w, h);

    const maze = state.maze;
    const vp = calculateViewport(w, h, maze.config.columns, maze.config.rows, 14);
    const cs = vp.cellSize;
    const ox = vp.offsetX;
    const oy = vp.offsetY;

    // 1. Terreno completo
    for (let r = 0; r < maze.cells.length; r++) {
      const row = maze.cells[r];
      for (let c = 0; c < row.length; c++) {
        ctx.fillStyle = row[c] === "floor" ? "#23334d" : "#090e1a";
        ctx.fillRect(ox + c * cs, oy + r * cs, cs, cs);
      }
    }

    // 2. Entradas
    (maze.entrances || []).forEach((ent, idx) => {
      const style = PALETTE[idx % PALETTE.length];
      ctx.fillStyle = style.hex;
      ctx.fillRect(ox + ent.column * cs, oy + ent.row * cs, cs, cs);
    });

    // 3. Kevin (K) con aura de baliza para transmisión
    if (maze.kevin) {
      const kx = ox + maze.kevin.column * cs + cs / 2;
      const ky = oy + maze.kevin.row * cs + cs / 2;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(kx, ky, Math.max(5, cs * 0.75), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(kx, ky, Math.max(3, cs * 0.46), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#060a12";
      ctx.font = "bold " + Math.max(9, Math.floor(cs * 0.6)) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K", kx, ky);
    }

    // 4. Posiciones de los participantes
    const participants = state.summary.participants || [];
    (state.positions || []).forEach((posItem) => {
      const pIdx = participants.findIndex(p => p.id === posItem.participantId);
      const style = PALETTE[(pIdx >= 0 ? pIdx : 0) % PALETTE.length];
      const px = ox + posItem.position.column * cs + cs / 2;
      const py = oy + posItem.position.row * cs + cs / 2;

      ctx.fillStyle = style.hex;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(3, cs * 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#060a12";
      ctx.font = "bold " + Math.max(8, Math.floor(cs * 0.55)) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String((pIdx >= 0 ? pIdx : 0) + 1), px, py);
    });

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, vp.mapW, vp.mapH);
  }

  function updateObsParticipantCards(state) {
    const container = document.getElementById("obs-participants-row");
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    const participants = state.summary.participants || [];
    participants.forEach((p, idx) => {
      const style = PALETTE[idx % PALETTE.length];
      const card = document.createElement("div");
      card.className = "broadcast-player-badge";
      card.style.borderColor = style.hex;

      const dot = document.createElement("span");
      dot.className = "color-dot " + (p.connected ? "status-green" : "status-red");
      dot.style.backgroundColor = p.connected ? "#22c55e" : "#f43f5e";
      card.appendChild(dot);

      const label = document.createElement("span");
      label.style.color = style.hex;
      label.textContent = "J" + (idx + 1) + ": ";
      card.appendChild(label);

      const name = document.createElement("span");
      name.textContent = p.displayName;
      card.appendChild(name);

      container.appendChild(card);
    });
  }

  function showBroadcastWinner(summary) {
    const banner = document.getElementById("broadcast-winner-banner");
    const title = document.getElementById("broadcast-winner-text");
    if (!banner || !title) return;
    banner.hidden = false;

    if (summary.winnerId) {
      const winner = (summary.participants || []).find(p => p.id === summary.winnerId);
      const name = winner ? winner.displayName : "Un jugador";
      title.textContent = "🏆 ¡" + name + " HA ENCONTRADO A KEVIN! 🏆";
    } else {
      title.textContent = "⏰ ¡TIEMPO AGOTADO! Ningún jugador alcanzó a Kevin.";
    }
  }

  function handleMoveIntent(direction) {
    if (role !== "player" || !myParticipantId) return;
    if (!lastKnownStatus || lastKnownStatus.phase !== "running") return;

    // Validación local para no intentar atravesar paredes conocidas ni salir de límites
    if (lastKnownView) {
      const pos = lastKnownView.position;
      let targetCol = pos.column;
      let targetRow = pos.row;
      if (direction === "up") targetRow -= 1;
      else if (direction === "down") targetRow += 1;
      else if (direction === "left") targetCol -= 1;
      else if (direction === "right") targetCol += 1;

      if (targetCol < 0 || targetRow < 0 || targetCol >= lastKnownView.columns || targetRow >= lastKnownView.rows) {
        return; // Fuera de límites
      }

      const isKnownWall = (lastKnownView.visible || []).some(c => c.column === targetCol && c.row === targetRow && c.terrain === "wall") ||
                          (lastKnownView.explored || []).some(c => c.column === targetCol && c.row === targetRow && c.terrain === "wall");
      if (isKnownWall) {
        return; // Bloqueado por pared conocida
      }
    }

    send("player.move", {
      direction: direction,
      sequence: nextSequence++
    });
  }

  function setupPlayerInput() {
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      const map = {
        ArrowUp: "up", KeyW: "up", w: "up", W: "up",
        ArrowDown: "down", KeyS: "down", s: "down", S: "down",
        ArrowLeft: "left", KeyA: "left", a: "left", A: "left",
        ArrowRight: "right", KeyD: "right", d: "right", D: "right"
      };
      const dir = map[e.code] || map[e.key];
      if (dir) {
        e.preventDefault();
        handleMoveIntent(dir);
      }
    });

    document.querySelectorAll("[data-dir]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const dir = btn.getAttribute("data-dir");
        if (dir) handleMoveIntent(dir);
      });
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const dir = btn.getAttribute("data-dir");
        if (dir) handleMoveIntent(dir);
      });
    });

    const joinBtn = document.getElementById("player-join-btn");
    const aliasInput = document.getElementById("player-alias-input");
    if (joinBtn && aliasInput) {
      const doJoin = () => {
        const val = aliasInput.value.trim();
        if (!val) {
          alert("Por favor introduce un alias válido (1–24 caracteres).");
          return;
        }
        myDisplayName = val;
        send("player.join", { displayName: val });
      };
      joinBtn.addEventListener("click", doJoin);
      aliasInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doJoin();
      });
    }
  }

  function setupDirectorControls() {
    const startBtn = document.getElementById("admin-start-btn");
    const resetBtn = document.getElementById("admin-reset-btn");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        send("admin.start");
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("¿Crear una nueva partida? Esto reiniciará la sala y las sesiones.")) {
          send("room.create");
        }
      });
    }
  }

  function init() {
    connectWs();
    if (role === "player") {
      setupPlayerInput();
      setupCanvasObserver("player-canvas", () => {
        if (lastKnownView) renderPlayerCanvas(lastKnownView);
      });
    } else if (role === "director") {
      setupDirectorControls();
      setupCanvasObserver("director-canvas", () => {
        if (lastKnownBroadcast) renderBroadcastCanvas("director-canvas", lastKnownBroadcast);
      });
    } else if (role === "broadcast") {
      setupCanvasObserver("obs-canvas", () => {
        if (lastKnownBroadcast) renderBroadcastCanvas("obs-canvas", lastKnownBroadcast);
      });
    }

    window.addEventListener("resize", () => {
      if (role === "player") {
        const c = document.getElementById("player-canvas");
        if (c && syncCanvasBitmapSize(c) && lastKnownView) {
          renderPlayerCanvas(lastKnownView);
        }
      } else if (role === "director") {
        const c = document.getElementById("director-canvas");
        if (c && syncCanvasBitmapSize(c) && lastKnownBroadcast) {
          renderBroadcastCanvas("director-canvas", lastKnownBroadcast);
        }
      } else if (role === "broadcast") {
        const c = document.getElementById("obs-canvas");
        if (c && syncCanvasBitmapSize(c) && lastKnownBroadcast) {
          renderBroadcastCanvas("obs-canvas", lastKnownBroadcast);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();`;
