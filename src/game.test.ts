// Headless simulation tests: the Game runs in Node with a seeded RNG and no audio.
import { describe, expect, it } from "vitest";
import { Game } from "./game";
import { makeRng } from "./rng";
import * as cfg from "./config";
import type { InputState } from "./types";

const W = 1280;
const H = 720;
const INPUT: InputState = { move: { x: 1, y: 0 }, firing: true, aimDir: { x: 0, y: -1 } };

function run(seed: number, steps: number): Game {
  const g = new Game(W, H, {}, makeRng(seed));
  g.reset();
  for (let i = 0; i < steps; i++) g.step(INPUT, cfg.FIXED_DT);
  return g;
}

describe("simulation", () => {
  it("same seed is deterministic", () => {
    const a = run(42, 3600);
    const b = run(42, 3600);
    expect(b.score).toBe(a.score);
    expect(b.kills).toBe(a.kills);
    expect(b.wave).toBe(a.wave);
    expect(b.lives).toBe(a.lives);
    expect(b.enemies.length).toBe(a.enemies.length);
    expect(b.player.pos).toEqual(a.player.pos);
  });

  it("different seeds diverge", () => {
    const a = run(1, 3600);
    const b = run(2, 3600);
    const same = a.score === b.score && a.time === b.time && a.enemies.length === b.enemies.length;
    expect(same).toBe(false);
  });

  it("pause freezes time", () => {
    const g = run(42, 600);
    const t = g.time;
    g.paused = true;
    for (let i = 0; i < 100; i++) g.step(INPUT, cfg.FIXED_DT);
    expect(g.time).toBe(t);
  });

  it("entities stay in bounds", () => {
    const g = run(42, 3600);
    for (const e of g.enemies) {
      expect(e.pos.x).toBeGreaterThanOrEqual(0);
      expect(e.pos.x).toBeLessThanOrEqual(W);
      expect(e.pos.y).toBeGreaterThanOrEqual(0);
      expect(e.pos.y).toBeLessThanOrEqual(H);
    }
  });
});
