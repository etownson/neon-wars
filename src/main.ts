// Entry point: wires the canvas, input, renderer and fixed-timestep loop.
import { Input } from "./input";
import { Game } from "./game";
import { Renderer } from "./renderer";
import { FIXED_DT } from "./config";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const killsEl = document.getElementById("kills") as HTMLSpanElement;

const size = () => ({ w: window.innerWidth, h: window.innerHeight });

let { w, h } = size();
const input = new Input(canvas);
const game = new Game(w, h);
const renderer = new Renderer(canvas);

renderer.resize(w, h);

window.addEventListener("resize", () => {
  ({ w, h } = size());
  renderer.resize(w, h);
  game.resize(w, h);
});

// Fixed-timestep accumulator so physics stays deterministic across frame rates.
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  acc += dt;

  while (acc >= FIXED_DT) {
    const raw = input.read(game.player.pos);
    const state = {
      move: raw.move,
      firing: raw.aim.firing,
      aimDir: raw.aim.dir,
    };
    game.step(state, FIXED_DT);
    acc -= FIXED_DT;
  }

  killsEl.textContent = String(game.kills);
  renderer.render(game);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
