export const browserStyles = `
:root {
  color-scheme: dark;
  --bg-base: #060a12;
  --bg-panel: #0f172a;
  --bg-card: #131c31;
  --bg-input: #090e1a;
  --border-subtle: #1e293b;
  --border-strong: #334155;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --accent-cyan: #38bdf8;
  --accent-gold: #facc15;
  --status-green: #22c55e;
  --status-red: #f43f5e;
  --status-amber: #f59e0b;
}

*, *::before, *::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.4;
}

/* Base Shell */
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: linear-gradient(180deg, #111a2e 0%, #0b1120 100%);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.brand-titles {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.app-title {
  margin: 0;
  font-size: clamp(1rem, 0.8rem + 0.6vw, 1.25rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.app-subtitle {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent-cyan);
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.badge.phase-waiting { background: rgba(148, 163, 184, 0.15); color: #94a3b8; border-color: #475569; }
.badge.phase-countdown { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-color: #f59e0b; }
.badge.phase-running { background: rgba(34, 197, 94, 0.2); color: #4ade80; border-color: #22c55e; }
.badge.phase-finished { background: rgba(250, 204, 21, 0.2); color: #facc15; border-color: #eab308; }

.badge.status-disconnected {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
  border-color: #f43f5e;
}

.error-banner {
  background-color: rgba(244, 63, 94, 0.2);
  color: #fecdd3;
  border-bottom: 1px solid rgba(244, 63, 94, 0.4);
  padding: 8px 16px;
  text-align: center;
  font-weight: 600;
  font-size: 0.85rem;
  flex-shrink: 0;
}

/* General Layouts */
.main-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

/* Player Views */
.player-join-screen,
.player-lobby-screen {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: radial-gradient(circle at center, #101c38 0%, #060a12 100%);
  min-height: 0;
  overflow-y: auto;
}

.card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 24px;
  max-width: 440px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
}

.card h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.field-group,
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-group label,
.label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
}

input[type="text"], input[type="password"], .input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.95rem;
}

input[type="text"]:focus, .input:focus {
  outline: 2px solid var(--accent-cyan);
  outline-offset: 1px;
}

.primary-btn, .btn-primary {
  background-color: var(--accent-cyan);
  color: #04101d;
}
.primary-btn:hover:not(:disabled), .btn-primary:hover:not(:disabled) {
  background-color: #0284c7;
  color: #ffffff;
}
.primary-btn:disabled, .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-btn, .btn-secondary {
  background-color: var(--bg-card);
  color: var(--text-primary);
  border-color: var(--border-strong);
}
.secondary-btn:hover:not(:disabled), .btn-secondary:hover:not(:disabled) {
  border-color: var(--accent-cyan);
}

.danger-btn {
  background-color: rgba(244, 63, 94, 0.2);
  color: #fb7185;
  border-color: rgba(244, 63, 94, 0.4);
}
.danger-btn:hover:not(:disabled) {
  background-color: #e11d48;
  color: #fff;
}

.btn {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
  border: 1px solid transparent;
}

.lobby-participants {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.participants-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.participants-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.participant-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-subtle);
  font-size: 0.85rem;
}

.participant-name-col {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.color-dot.status-red, .status-red {
  background-color: var(--status-red);
}

.color-dot.status-green, .status-green {
  background-color: var(--status-green);
}

/* Player Active Game View */
.player-game-view {
  flex: 1 1 auto;
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.player-hud,
.game-hud-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: #0b1120;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.85rem;
  z-index: 10;
  flex-shrink: 0;
  gap: 12px;
}

.hud-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hud-label {
  color: var(--text-muted);
}

.hud-value,
.hud-val {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.hud-timer,
.timer-value {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--accent-gold);
}

.alert-kevin {
  display: inline-flex;
  align-items: center;
  background: rgba(250, 204, 21, 0.2);
  color: #facc15;
  border: 1px solid rgba(250, 204, 21, 0.5);
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.8rem;
  animation: pulse 1s infinite;
}

/* Canvas Viewports & Strict Layout Isolation */
.canvas-wrapper,
.canvas-container {
  flex: 1 1 auto;
  position: relative;
  display: block;
  overflow: hidden;
  background-color: #030712;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}

.canvas-wrapper canvas,
.canvas-container canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

/* Touch Controls / D-Pad */
.touch-controls,
.touch-controls-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background-color: #080d18;
  border-top: 1px solid var(--border-subtle);
  z-index: 10;
  flex-shrink: 0;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 46px);
  grid-template-rows: repeat(2, 44px);
  gap: 6px;
}

.dpad-btn {
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background-color: var(--bg-card);
  color: var(--text-primary);
  font-size: 1.2rem;
  font-weight: 800;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dpad-btn:active {
  background-color: var(--accent-cyan);
  color: #04101d;
  border-color: var(--accent-cyan);
}

.dpad-btn.up, .dpad-up { grid-column: 2; grid-row: 1; }
.dpad-btn.left, .dpad-left { grid-column: 1; grid-row: 2; }
.dpad-btn.down, .dpad-down { grid-column: 2; grid-row: 2; }
.dpad-btn.right, .dpad-right { grid-column: 3; grid-row: 2; }
.dpad-btn.center, .dpad-center { grid-column: 2; grid-row: 2; visibility: hidden; }

/* Overlays */
.overlay-screen,
.countdown-overlay,
.result-modal {
  position: absolute;
  inset: 0;
  background: rgba(3, 7, 18, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 50;
  backdrop-filter: blur(4px);
  padding: 20px;
}

.countdown-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--accent-cyan);
  margin-bottom: 8px;
  letter-spacing: 0.05em;
}

.countdown-digits,
.countdown-number {
  font-size: clamp(4rem, 12vw, 8rem);
  font-weight: 900;
  color: var(--accent-gold);
  text-shadow: 0 0 30px rgba(250, 204, 21, 0.5);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.9; }
  100% { transform: scale(1); opacity: 1; }
}

.result-card {
  background: #111a2e;
  border: 2px solid var(--accent-gold);
  border-radius: 14px;
  padding: 28px;
  max-width: 520px;
  width: 100%;
  text-align: center;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.8);
}

.result-title {
  margin: 0 0 8px;
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--accent-gold);
}

.result-subtitle,
.result-desc {
  margin: 0 0 20px;
  color: var(--text-secondary);
  font-size: 1rem;
}

.results-table-wrap {
  width: 100%;
  overflow-x: auto;
  margin-top: 12px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.results-table th, .results-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.results-table th {
  color: var(--text-muted);
  font-weight: 600;
}

.results-table tr:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

/* Director (/admin) View */
.director-shell,
.admin-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.director-sidebar,
.admin-sidebar {
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-subtle);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.admin-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.director-main,
.admin-preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background-color: #030712;
  position: relative;
  overflow: hidden;
}

.preview-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background-color: #0b1120;
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.preview-header h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.alert-box {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.82rem;
  border: 1px solid var(--border-strong);
  background-color: var(--bg-card);
}

.alert-box.info { border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.1); color: #bae6fd; }
.alert-box.warning { border-color: rgba(245, 158, 11, 0.5); background: rgba(245, 158, 11, 0.12); color: #fde68a; }
.alert-box.danger { border-color: rgba(244, 63, 94, 0.5); background: rgba(244, 63, 94, 0.15); color: #fecdd3; }

.unauth-screen {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: radial-gradient(circle at center, #101c38 0%, #060a12 100%);
}

/* OBS Broadcast View (/broadcast) */
.broadcast-shell,
.obs-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  background-color: #030712;
  overflow: hidden;
}

.broadcast-topbar,
.obs-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: linear-gradient(180deg, #0d1527 0%, rgba(13, 21, 39, 0.4) 100%);
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  z-index: 10;
  flex-shrink: 0;
}

.obs-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.obs-title {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--text-primary);
}

.obs-center-hud {
  display: flex;
  align-items: center;
  gap: 12px;
}

.obs-timer-display {
  font-size: 1.4rem;
  font-weight: 900;
  color: var(--accent-gold);
  font-variant-numeric: tabular-nums;
}

.obs-viewport {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.broadcast-bottombar,
.obs-participants-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 6px 16px;
  background: linear-gradient(0deg, #0d1527 0%, rgba(13, 21, 39, 0.4) 100%);
  border-top: 1px solid rgba(51, 65, 85, 0.5);
  z-index: 10;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.broadcast-player-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid var(--border-strong);
  font-size: 0.8rem;
  font-weight: 700;
}

.broadcast-winner-overlay,
.obs-winner-banner {
  position: absolute;
  top: 14%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(11, 17, 32, 0.92);
  border: 3px solid var(--accent-gold);
  border-radius: 16px;
  padding: 16px 36px;
  text-align: center;
  z-index: 40;
  box-shadow: 0 0 50px rgba(250, 204, 21, 0.4);
  animation: fadeIn 0.4s ease-out;
}

.obs-winner-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--accent-gold);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translate(-50%, -10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

@media (max-width: 800px) {
  .director-shell,
  .admin-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow-y: auto;
  }
  .director-main,
  .admin-preview-panel {
    min-height: 400px;
  }
}
`;
