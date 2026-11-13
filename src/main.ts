// Entry point: wires the canvas, input, renderer and a variable-timestep loop.
// Variable timestep renders exactly what was simulated this frame, which avoids
// the stair-stepping judder that a fixed timestep can show on mismatched refresh
// rates. All game physics are continuous (acceleration/velocity based), so this
// is safely frame-rate independent.
import { Input } from "./input";
import { Game } from "./game";
import { Renderer } from "./renderer";
import { Sounds } from "./audio";

const MAX_DT = 0.05; // cap to avoid physics blowups after a long stall/tab switch
const sounds = new Sounds();

const canvas = document.getElementById("game") as HTMLCanvasElement;
const killsEl = document.getElementById("kills") as HTMLSpanElement;
const waveEl = document.getElementById("wave") as HTMLSpanElement;
const scoreEl = document.getElementById("score") as HTMLSpanElement;
const multEl = document.getElementById("mult") as HTMLSpanElement;

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

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;

  const raw = input.read(game.player.pos);
  game.step(
    { move: raw.move, firing: raw.aim.firing, aimDir: raw.aim.dir },
    dt
  );

  // Shoulder buttons step the wave (LB down / RB up).
  const wstep = input.getWaveStep();
  if (wstep !== 0) game.setWave(game.wave + wstep);

  sounds.setIntensity(Math.min(1, (game.wave - 1) / 9));

  killsEl.textContent = String(game.kills);
  waveEl.textContent = String(game.wave);
  scoreEl.textContent = String(game.score);
  multEl.textContent = `x${game.multiplier}`;
  multEl.classList.toggle("on", game.multiplier > 1);
  renderer.render(game);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
