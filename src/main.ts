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

const MAX_DT = 0.05; // cap to avoid physics blowups after a long stall/tab switch
const sounds = new Sounds();

// Surface any runtime error on-screen so a silent freeze is diagnosable
// (dev aid; remove for production).
window.addEventListener("error", (e) => {
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = "ERROR: " + ((e.error && e.error.stack) || e.message || "unknown");
});
window.addEventListener("unhandledrejection", (e) => {
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = "ERROR: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
});

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

// Dev shortcut: number keys jump straight to a wave (0 = wave 10).
window.addEventListener("keydown", (e) => {
  if (!/^[0-9]$/.test(e.key)) return;
  const n = e.key === "0" ? 10 : Number(e.key);
  if (n >= 1 && n <= 15) game.setWave(n);
});

// Restart a finished run from any key / click.
const tryRestart = () => {
  if (game.gameOver) game.reset();
};
window.addEventListener("keydown", tryRestart);
window.addEventListener("pointerdown", tryRestart);

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

  const raw = input.read(game.player.pos);
  game.step(
    { move: raw.move, firing: raw.aim.firing, aimDir: raw.aim.dir },
    dt
  );

  // Shoulder buttons step the wave (LB down / RB up); B/fire detonates a bomb.
  const wstep = input.getWaveStep();
  if (wstep !== 0) game.setWave(game.wave + wstep);
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
    if (!gameOverShown && gameoverEl && finalScoreEl) {
      finalScoreEl.textContent = String(game.score);
      gameoverEl.style.display = "flex";
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
