// Headless simulation tests: the Game runs in Node with a seeded RNG and no audio.
import { describe, expect, it } from "vitest";
import { Game } from "./game";
import { FixedStepper } from "./fixedStep";
import { makeRng } from "./rng";
import * as cfg from "./config";
import type { Enemy, InputState } from "./types";

const W = 1280;
const H = 720;
const INPUT: InputState = { move: { x: 1, y: 0 }, firing: true, aimDir: { x: 0, y: -1 } };

/** Run a fresh game for `seconds` of simulated time with a fixed input. */
function run(seed: number, seconds: number, input: InputState = INPUT, w = W, h = H): Game {
  const g = new Game(w, h, {}, makeRng(seed));
  g.reset();
  const steps = Math.round(seconds / cfg.FIXED_DT);
  for (let i = 0; i < steps; i++) g.step(input, cfg.FIXED_DT);
  return g;
}

describe("simulation", () => {
  it("same seed is deterministic", () => {
    const a = run(42, 30);
    const b = run(42, 30);
    expect(b.score).toBe(a.score);
    expect(b.kills).toBe(a.kills);
    expect(b.wave).toBe(a.wave);
    expect(b.lives).toBe(a.lives);
    expect(b.enemies.length).toBe(a.enemies.length);
    expect(b.player.pos).toEqual(a.player.pos);
  });

  it("different seeds diverge", () => {
    const a = run(1, 30);
    const b = run(2, 30);
    const same = a.score === b.score && a.time === b.time && a.enemies.length === b.enemies.length;
    expect(same).toBe(false);
  });

  it("pause freezes time", () => {
    const g = run(42, 5);
    const t = g.time;
    g.paused = true;
    for (let i = 0; i < 100; i++) g.step(INPUT, cfg.FIXED_DT);
    expect(g.time).toBe(t);
  });

  it("entities stay in bounds", () => {
    const g = run(42, 30);
    for (const e of g.enemies) {
      expect(e.pos.x).toBeGreaterThanOrEqual(0);
      expect(e.pos.x).toBeLessThanOrEqual(W);
      expect(e.pos.y).toBeGreaterThanOrEqual(0);
      expect(e.pos.y).toBeLessThanOrEqual(H);
    }
  });
});

describe("player movement", () => {
  // A large arena so the ship never reaches the wall; no enemies spawn in the first second.
  const BIG = 8000;
  const RIGHT: InputState = { move: { x: 1, y: 0 }, firing: false, aimDir: { x: 0, y: 0 } };

  it("eases in from rest instead of jumping", () => {
    const g = new Game(BIG, BIG, {}, makeRng(1));
    g.reset();
    const x0 = g.player.pos.x;
    g.step(RIGHT, cfg.FIXED_DT);
    const speed = (g.player.pos.x - x0) / cfg.FIXED_DT;
    expect(speed).toBeLessThan(cfg.PLAYER_SPEED * 0.1);
  });

  it("tops out at PLAYER_SPEED", () => {
    const g = run(1, 0.9, RIGHT, BIG, BIG);
    const x0 = g.player.pos.x;
    g.step(RIGHT, cfg.FIXED_DT);
    const speed = (g.player.pos.x - x0) / cfg.FIXED_DT;
    expect(speed).toBeGreaterThan(cfg.PLAYER_SPEED * 0.99);
    expect(speed).toBeLessThanOrEqual(cfg.PLAYER_SPEED + 1e-6);
  });
});

describe("fixed timestep", () => {
  function stepsFor(seconds: number, fps: number): number {
    const s = new FixedStepper(cfg.FIXED_DT, 1000);
    let n = 0;
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) n += s.advance(1 / fps);
    return n;
  }

  it("runs the same number of steps at any refresh rate", () => {
    const expected = Math.round(10 / cfg.FIXED_DT);
    for (const fps of [30, 60, 120, 144, 165]) {
      expect(Math.abs(stepsFor(10, fps) - expected)).toBeLessThanOrEqual(1);
    }
  });

  it("caps steps per frame and drops the backlog", () => {
    const s = new FixedStepper(cfg.FIXED_DT, 12);
    expect(s.advance(10)).toBe(12);
    expect(s.advance(0)).toBe(0);
  });
});

describe("bomb", () => {
  function chaserAt(x: number, y: number): Enemy {
    return { kind: "chaser", pos: { x, y }, vel: { x: 0, y: 0 }, radius: cfg.CHASER_RADIUS, hp: cfg.ENEMY_HP, spin: 0, fireCooldown: 0, life: 0 };
  }

  it("scores every enemy at the multiplier in effect when detonated", () => {
    const g = new Game(W, H, {}, makeRng(1));
    g.reset();
    g.streak = 10;
    g.multiplier = 5;
    g.bombs = 1;
    g.enemies = [chaserAt(100, 100), chaserAt(200, 100), chaserAt(300, 100), chaserAt(400, 100)];
    g.detonateBomb();
    expect(g.score).toBe(4 * cfg.SCORE.chaser * 5);
    expect(g.enemies.length).toBe(0);
    expect(g.bombs).toBe(0);
    expect(g.streak).toBe(14);
    expect(g.multiplier).toBeGreaterThan(5); // streak still builds afterward
  });
});

describe("spawn mix", () => {
  it("applies the latest SPAWN_MIX entry for the wave", () => {
    const g = new Game(W, H, {}, makeRng(3));
    g.reset();
    const seen = (wave: number): Set<string> => {
      g.setWave(wave);
      const kinds = new Set<string>();
      for (let i = 0; i < 400; i++) kinds.add((g as unknown as { pickKind(): string }).pickKind());
      return kinds;
    };
    expect([...seen(1)]).toEqual(["chaser"]);
    expect(seen(5)).toEqual(new Set(["chaser", "shooter"]));
    expect(seen(12)).toEqual(new Set(["chaser", "shooter", "splitter", "blackhole"]));
  });
});
