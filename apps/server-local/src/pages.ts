import { browserStyles } from "./styles.js";
import { browserClient } from "./client-script.js";

export { browserStyles, browserClient };

export function page(path: string): string {
  if (path === "/admin") {
    return renderAdminPage();
  }
  if (path === "/broadcast") {
    return renderBroadcastPage();
  }
  return renderPlayerPage();
}

function renderPlayerPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Kevin en su laberinto — Jugador</title>
  <link rel="stylesheet" href="/beta.css">
</head>
<body>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-titles">
        <h1 class="app-title">KEVIN EN SU LABERINTO</h1>
        <span class="app-subtitle">Vista de Jugador</span>
      </div>
      <div class="header-badges">
        <span id="conn-dot" class="color-dot status-red" title="Desconectado"></span>
        <span id="status-banner" class="badge">Conectando…</span>
      </div>
    </header>

    <div id="error-banner" class="error-banner" hidden></div>

    <main class="main-content">
      <section id="player-join-screen" class="player-join-screen">
        <div class="card">
          <h2>Entrar a la carrera</h2>
          <p class="hint">Introduce tu alias para unirte a la partida local en el aula.</p>
          <div class="form-group">
            <label for="player-alias-input" class="label">Tu alias (1–24 caracteres):</label>
            <input id="player-alias-input" class="input" maxlength="24" placeholder="Ej. Alex, Lucía..." autocomplete="off" autofocus />
          </div>
          <button id="player-join-btn" class="btn btn-primary">Unirme a la carrera</button>
        </div>
      </section>

      <section id="player-lobby-screen" class="player-lobby-screen" hidden>
        <div class="card">
          <h2>Sala de espera</h2>
          <p class="hint">Te has unido correctamente. Esperando a que el director inicie la carrera cuando haya al menos 3 participantes.</p>
          <div class="lobby-participants">
            <div class="participants-header">
              <span>Participantes conectados:</span>
              <span id="connected-count-badge" class="badge">0 / 6</span>
            </div>
            <div id="participants-list" class="participants-list"></div>
          </div>
        </div>
      </section>

      <section id="player-game-view" class="player-game-view" hidden>
        <div class="player-hud">
          <div class="hud-item">
            <span class="hud-label">ESTADO</span>
            <span id="phase-badge" class="badge phase-running">En carrera</span>
          </div>
          <div class="hud-item">
            <span class="hud-label">TIEMPO</span>
            <span id="timer-display" class="timer-value">00:00</span>
          </div>
          <div class="hud-item">
            <span class="hud-label">POSICIÓN</span>
            <span id="hud-pos" class="hud-val">(0, 0)</span>
          </div>
          <div class="hud-item">
            <span class="hud-label">EXPLORADO</span>
            <span id="hud-explored-pct" class="hud-val">0.0%</span>
          </div>
          <span id="kevin-seen-alert" class="alert-kevin" hidden>¡KEVIN A LA VISTA!</span>
        </div>

        <div class="canvas-wrapper">
          <canvas id="player-canvas"></canvas>
          <div id="countdown-overlay" class="countdown-overlay" hidden>
            <div class="countdown-title">¡PREPÁRATE!</div>
            <div id="countdown-number" class="countdown-digits">3</div>
          </div>
        </div>

        <div class="touch-controls">
          <div class="dpad">
            <button class="dpad-btn dpad-up" data-dir="up" aria-label="Arriba">▲</button>
            <button class="dpad-btn dpad-left" data-dir="left" aria-label="Izquierda">◀</button>
            <button class="dpad-btn dpad-center" disabled></button>
            <button class="dpad-btn dpad-right" data-dir="right" aria-label="Derecha">▶</button>
            <button class="dpad-btn dpad-down" data-dir="down" aria-label="Abajo">▼</button>
          </div>
        </div>
      </section>

      <div id="player-finished-overlay" class="result-modal" hidden>
        <div class="result-card">
          <h2 id="player-result-title">Fin de partida</h2>
          <p id="player-result-desc" class="result-desc"></p>
          <div class="results-table-wrap">
            <table class="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Participante</th>
                  <th>Pasos</th>
                  <th>Explorado</th>
                </tr>
              </thead>
              <tbody id="player-results-body"></tbody>
            </table>
          </div>
          <p class="hint">El director puede reiniciar una nueva partida en cualquier momento.</p>
        </div>
      </div>
    </main>
  </div>
  <div style="display:none" aria-hidden="true">
    <label>Alias <input id="alias" maxlength="24"></label>
    <button id="join">Unirme</button>
    <button id="start">Iniciar</button>
    <button id="reset">Nueva partida</button>
    <p id="status"></p>
    <pre id="map"></pre>
    <pre id="details"></pre>
  </div>
  <script src="/beta-client.js"></script>
</body>
</html>`;
}

function renderAdminPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kevin en su laberinto — Dirección de partida</title>
  <link rel="stylesheet" href="/beta.css">
</head>
<body>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-titles">
        <h1 class="app-title">KEVIN EN SU LABERINTO</h1>
        <span class="app-subtitle">Dirección de Partida</span>
      </div>
      <div class="header-badges">
        <span id="conn-dot" class="color-dot status-red" title="Desconectado"></span>
        <span id="status-banner" class="badge">Conectando…</span>
        <span id="phase-badge" class="badge phase-waiting">En espera</span>
        <span id="timer-display" class="timer-value">00:00</span>
      </div>
    </header>

    <div id="error-banner" class="error-banner" hidden></div>

    <div id="unauth-screen" class="unauth-screen" hidden>
      <div class="card">
        <h2>Acceso No Autorizado</h2>
        <p>Esta pantalla requiere credenciales de director de partida. Utiliza el enlace completo generado por el servidor con el token hash (ejemplo: <code>/admin#TOKEN</code>).</p>
      </div>
    </div>

    <main id="authorized-content" class="main-content admin-layout">
      <div class="admin-sidebar">
        <div class="card">
          <h2>Control de Carrera</h2>
          <div class="admin-actions">
            <button id="admin-start-btn" class="btn btn-primary" disabled>Iniciar carrera</button>
            <p id="admin-start-warning" class="hint">Se necesitan al menos 3 participantes conectados para iniciar.</p>
            <button id="admin-reset-btn" class="btn btn-secondary">Nueva partida</button>
          </div>
        </div>

        <div class="card">
          <div class="participants-header">
            <h2>Participantes</h2>
            <span id="connected-count-badge" class="badge">0 / 6</span>
          </div>
          <div id="participants-list" class="participants-list"></div>
        </div>
      </div>

      <div class="admin-preview-panel">
        <div class="preview-header">
          <h2>Supervisión del Laberinto en Vivo</h2>
          <span class="hint">Vista global de participantes y Kevin</span>
        </div>
        <div class="canvas-wrapper">
          <canvas id="director-canvas"></canvas>
        </div>
      </div>
    </main>
  </div>
  <div style="display:none" aria-hidden="true">
    <label>Alias <input id="alias" maxlength="24"></label>
    <button id="join">Unirme</button>
    <button id="start">Iniciar</button>
    <button id="reset">Nueva partida</button>
    <p id="status"></p>
    <pre id="map"></pre>
    <pre id="details"></pre>
  </div>
  <script src="/beta-client.js"></script>
</body>
</html>`;
}

function renderBroadcastPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kevin en su laberinto — Transmisión OBS</title>
  <link rel="stylesheet" href="/beta.css">
</head>
<body>
  <div class="obs-shell">
    <header class="obs-topbar">
      <div class="obs-brand">
        <span class="obs-title">KEVIN EN SU LABERINTO</span>
        <span id="conn-dot" class="color-dot status-red" title="Estado"></span>
      </div>
      <div class="obs-center-hud">
        <span id="phase-badge" class="badge phase-waiting">En espera</span>
        <span id="obs-timer" class="obs-timer-display">00:00</span>
      </div>
      <div id="obs-participants-row" class="obs-participants-row"></div>
    </header>

    <div id="unauth-screen" class="unauth-screen" hidden>
      <div class="card">
        <h2>Transmisión No Autorizada</h2>
        <p>Se requiere el token de transmisión en la URL (ejemplo: <code>/broadcast#TOKEN</code>).</p>
      </div>
    </div>

    <main class="obs-viewport">
      <div class="canvas-wrapper">
        <canvas id="obs-canvas"></canvas>
        <div id="countdown-overlay" class="countdown-overlay" hidden>
          <div class="countdown-title">¡PREPÁRATE!</div>
          <div id="countdown-number" class="countdown-digits">3</div>
        </div>
        <div id="broadcast-winner-banner" class="obs-winner-banner" hidden>
          <h1 id="broadcast-winner-text" class="obs-winner-title"></h1>
        </div>
      </div>
    </main>
  </div>
  <div style="display:none" aria-hidden="true">
    <label>Alias <input id="alias" maxlength="24"></label>
    <button id="join">Unirme</button>
    <button id="start">Iniciar</button>
    <button id="reset">Nueva partida</button>
    <p id="status"></p>
    <pre id="map"></pre>
    <pre id="details"></pre>
  </div>
  <script src="/beta-client.js"></script>
</body>
</html>`;
}
