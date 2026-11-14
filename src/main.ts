// Entry point: wires the canvas, input, renderer and a variable-timestep loop.
// Variable timestep renders exactly what was simulated this frame, which avoids
// the stair-stepping judder that a fixed timestep can show on mismatched refresh
// rates. All game physics are continuous (acceleration/velocity based), so this
// is safely frame-rate independent.
import { Input } from "./input";
import { Game } from "./game";
import { Renderer } from "./renderer";
import { Sounds } from "./audio";
import * as cfg from "./config";
import {
  leaderboardEnabled,
  submitScore,
  fetchTopScores,
  type LeaderboardEntry,
} from "./leaderboard";

const MAX_DT = 0.05; // cap to avoid physics blowups after a long stall/tab switch
const sounds = new Sounds();

// Debug options (wave skipping, on-screen error readout) are only enabled when
// the page URL carries a debug flag, e.g. ?debug or ?debug=1.
const DEBUG = new URLSearchParams(window.location.search).has("debug");

if (DEBUG) {
  // Surface any runtime error on-screen so a silent freeze is diagnosable.
  window.addEventListener("error", (e) => {
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "ERROR: " + ((e.error && e.error.stack) || e.message || "unknown");
  });
  window.addEventListener("unhandledrejection", (e) => {
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "ERROR: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
  });
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const killsEl = document.getElementById("kills") as HTMLSpanElement;
const waveEl = document.getElementById("wave") as HTMLSpanElement;
const scoreEl = document.getElementById("score") as HTMLSpanElement;
const multEl = document.getElementById("mult") as HTMLSpanElement;
const hiEl = document.getElementById("hi") as HTMLSpanElement;
const bombsEl = document.getElementById("bombs") as HTMLSpanElement;
const livesEl = document.getElementById("lives") as HTMLDivElement;
const spreadEl = document.getElementById("spread") as HTMLSpanElement;
const gameoverEl = document.getElementById("gameover") as HTMLDivElement;
const finalScoreEl = document.getElementById("finalScore") as HTMLSpanElement;
const pausedEl = document.getElementById("paused") as HTMLDivElement;
const entryEl = document.getElementById("entry") as HTMLDivElement;
const initialsEl = document.getElementById("entryInitials") as HTMLInputElement;
const submitBtn = document.getElementById("submitScore") as HTMLButtonElement;
const entryStatusEl = document.getElementById("entryStatus") as HTMLSpanElement;
const boardListEl = document.getElementById("boardList") as HTMLElement;

const size = () => ({ w: window.innerWidth, h: window.innerHeight });

let { w, h } = size();
const input = new Input(canvas);
const game = new Game(w, h, sounds);
const renderer = new Renderer(canvas);

// Browsers block audio until a user gesture; unlock on any input.
const unlockAudio = () => sounds.start();
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });
window.addEventListener("gamepadconnected", unlockAudio, { once: true });

renderer.resize(w, h);

window.addEventListener("resize", () => {
  ({ w, h } = size());
  renderer.resize(w, h);
  game.resize(w, h);
});

// ---- Start screen ----
// The run doesn't begin until the player presses a key, clicks, or presses a
// gamepad button, so first-time players can read the briefing first.
const startEl = document.getElementById("start") as HTMLDivElement | null;
const hintEl = document.getElementById("hint");
let started = false;

if (hintEl && DEBUG) hintEl.textContent += " · 0-9/LB-RB wave (debug)";

function beginRun(): void {
  if (started) return;
  started = true;
  if (startEl) startEl.style.display = "none";
  game.reset();
  last = performance.now(); // don't count time spent on the start screen
}
window.addEventListener("keydown", (e) => {
  if (!started && !e.repeat) beginRun();
});
startEl?.addEventListener("pointerdown", beginRun);

// Debug shortcut: number keys jump straight to a wave (0 = wave 10).
window.addEventListener("keydown", (e) => {
  if (!DEBUG || !started) return;
  if (!/^[0-9]$/.test(e.key)) return;
  const n = e.key === "0" ? 10 : Number(e.key);
  if (n >= 1 && n <= 15) game.setWave(n);
});

// ---- Leaderboard UI (game over) ----

// Restarting while the player is typing initials would wipe the run out from
// under them. Track whether the initials field is the active element.
const typingInitials = () => document.activeElement === initialsEl;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderLeaderboard(entries: LeaderboardEntry[]): void {
  if (!boardListEl) return;
  if (entries.length === 0) {
    boardListEl.innerHTML =
      `<li class="empty">${leaderboardEnabled() ? "No scores yet" : "Set up Supabase to enable"}</li>`;
    return;
  }
  boardListEl.innerHTML = entries
    .map(
      (e, i) =>
        `<li><span class="rank">${i + 1}</span>` +
        `<span class="ini">${escapeHtml(e.initials)}</span>` +
        `<span class="pts">${e.score}</span></li>`
    )
    .join("");
}

async function refreshLeaderboard(): Promise<void> {
  const entries = await fetchTopScores(10);
  renderLeaderboard(entries);
}

// Only offer initials entry when the leaderboard is configured and the run
// scored non-zero points; otherwise hide the form entirely.
function showEntryForm(score: number): void {
  if (!entryEl) return;
  const show = leaderboardEnabled() && score > 0;
  entryEl.style.display = show ? "flex" : "none";
  if (show) {
    initialsEl.disabled = false;
    submitBtn.disabled = false;
    entryStatusEl.textContent = "";
    initialsEl.value = "";
  }
}

// Enter submits; typing is sanitized to 1-3 uppercase letters/digits.
initialsEl?.addEventListener("input", () => {
  initialsEl.value = initialsEl.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
});
initialsEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitBtn.click();
  }
});

submitBtn?.addEventListener("click", async () => {
  const initials = initialsEl.value.trim();
  if (!/^[A-Z0-9]{1,3}$/.test(initials)) {
    entryStatusEl.textContent = "1-3 letters";
    return;
  }
  submitBtn.disabled = true;
  entryStatusEl.textContent = "Submitting…";
  const res = await submitScore(initials, game.score, game.wave);
  if (res.ok) {
    entryStatusEl.textContent = "Saved!";
    initialsEl.disabled = true;
    await refreshLeaderboard();
  } else {
    entryStatusEl.textContent = res.error + " — try again";
    submitBtn.disabled = false;
  }
});

// ---- Restart a finished run from any key, or a click on the overlay ----

const tryRestart = () => {
  if (typingInitials()) return; // don't hijack the initials field
  if (game.gameOver) {
    initialsEl?.blur(); // release any stuck focus so the next run is clean
    game.reset();
  }
};
window.addEventListener("keydown", tryRestart);

gameoverEl?.addEventListener("pointerdown", (e) => {
  if (!game.gameOver) return;
  // Clicks inside the entry form (input / submit / status) shouldn't restart.
  const target = e.target as HTMLElement | null;
  if (target && target.closest && target.closest("#entry")) return;
  initialsEl?.blur();
  game.reset();
});

let lastLives = game.lives;
let lastWave = game.wave;
let wavePulseTimer = 0;
let gameOverShown = false;

function renderLives(n: number): void {
  livesEl.innerHTML = Array.from({ length: cfg.LIVES_MAX }, (_, i) =>
    `<span class="dot${i < n ? "" : " dead"}"></span>`
  ).join("");
}

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;

  if (!started) {
    // Drain edge-triggered inputs so nothing carries over into the run.
    input.getPauseToggle();
    input.getBombPressed();
    input.getWaveStep();
    if (input.getMusicToggle()) sounds.toggleMusic();
    if (input.getAnyPress()) beginRun();
    renderer.render(game);
    requestAnimationFrame(frame);
    return;
  }

  const raw = input.read(game.player.pos);
  game.step(
    { move: raw.move, firing: raw.aim.firing, aimDir: raw.aim.dir },
    dt
  );

  // Debug: shoulder buttons step the wave (LB down / RB up). B/F detonates a bomb.
  const wstep = input.getWaveStep();
  if (DEBUG && wstep !== 0) game.setWave(game.wave + wstep);
  if (input.getBombPressed()) game.detonateBomb();

  // Any key (handler above) or any gamepad button restarts on game over.
  if (game.gameOver && input.getAnyPress()) game.reset();

  // Y button / M key toggles the music bed.
  if (input.getMusicToggle()) sounds.toggleMusic();

  // Start/menu button (or Esc/P) toggles pause.
  if (input.getPauseToggle() && !game.gameOver) {
    game.paused = !game.paused;
    if (game.paused) sounds.setRumble(0); // drop the drone while paused
  }

  sounds.setIntensity(Math.min(1, (game.wave - 1) / 9));

  // Tight wave-up acknowledgement: sting sound + brief HUD pulse.
  if (game.wave > lastWave) {
    lastWave = game.wave;
    sounds.waveUp();
    wavePulseTimer = 0.5;
  } else if (game.wave < lastWave) {
    lastWave = game.wave; // reset or jump down — track, but no ack
  }
  if (wavePulseTimer > 0) {
    wavePulseTimer -= dt;
    waveEl?.classList.add("pulse");
    if (wavePulseTimer <= 0) waveEl?.classList.remove("pulse");
  }

  // HUD (guarded: a missing element must never crash the game loop).
  if (killsEl) killsEl.textContent = String(game.kills);
  if (waveEl) waveEl.textContent = String(game.wave);
  if (scoreEl) scoreEl.textContent = String(game.score);
  if (multEl) {
    multEl.textContent = `x${game.multiplier}`;
    multEl.classList.toggle("on", game.multiplier > 1);
    multEl.classList.toggle("max", game.multiplier >= cfg.MAX_MULTIPLIER);
  }
  if (hiEl) hiEl.textContent = String(game.best);
  if (bombsEl) bombsEl.textContent = String(game.bombs);
  if (game.lives !== lastLives && livesEl) {
    renderLives(game.lives);
    lastLives = game.lives;
  }
  if (spreadEl) {
    if (game.spreadTimer > 0) {
      spreadEl.textContent = `SPREAD ${Math.ceil(game.spreadTimer)}s`;
      spreadEl.classList.remove("off");
    } else {
      spreadEl.textContent = "";
      spreadEl.classList.add("off");
    }
  }

  // Pause overlay.
  if (pausedEl) pausedEl.style.display = game.paused ? "flex" : "none";

  // Game over overlay.
  if (game.gameOver) {
    // Simulation is frozen, so ease the screen shake out gently instead of
    // leaving it jittering at full death-trauma forever.
    game.shake = Math.max(0, game.shake - dt * 2.2);
    // The rumble drone is driven per-frame inside game.step(), which returns
    // early once the run is over — so fade it out here or it would linger
    // forever (mirror of the pause handling).
    sounds.setRumble(0);
    if (!gameOverShown && gameoverEl && finalScoreEl) {
      finalScoreEl.textContent = String(game.score);
      gameoverEl.style.display = "flex";
      showEntryForm(game.score);
      void refreshLeaderboard();
      gameOverShown = true;
    }
  } else if (gameOverShown && gameoverEl) {
    gameoverEl.style.display = "none";
    gameOverShown = false;
  }

  renderer.render(game);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
