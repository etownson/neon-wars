# Neon Wars — agent instructions

Browser twin-stick arena shooter. TypeScript (strict), Vite 5, Canvas 2D, Web Audio.
No runtime dependencies. Game design lives in NEON_WARS_DESIGN.md; where it disagrees
with src/config.ts, config.ts is the truth.

## Commands
- `npm ci`          install
- `npm run build`   type-check (tsc, noEmit) then bundle. MUST pass before you finish.
- `npm test`        headless simulation tests (Vitest). MUST pass.
- `npm run dev`     dev server on :5173. Do not start it; you cannot see the screen.

## Layout
- src/config.ts      every tunable number and colour. No magic numbers elsewhere.
- src/types.ts       entity and input types shared by simulation and renderer.
- src/vec.ts         2D vector helpers.
- src/rng.ts         seeded RNG (mulberry32) injected into Game.
- src/fixedStep.ts   fixed-timestep accumulator used by main.ts.
- src/*.test.ts      Vitest tests; run headlessly in Node.
- src/game.ts        the simulation. `Game.step(input, dt)` advances it. Owns all rules.
- src/renderer.ts    draws a Game to the canvas. Reads state, never changes it.
- src/input.ts       gamepad, keyboard, mouse -> InputState.
- src/audio.ts       `Fx` interface plus the Web Audio implementation `Sounds`.
- src/leaderboard.ts Supabase leaderboard client.
- src/main.ts        DOM wiring, HUD, frame loop. The only file that touches `document`.
- tasks/             one file per unit of work. Do exactly one task per session.

## Hard rules
1. game.ts must run in Node: no `document`, `window`, canvas, or audio objects.
   Sound and effects go through the `Fx` interface passed to the constructor.
2. game.ts must be deterministic: randomness only through the injected `Rng`
   (src/rng.ts), never `Math.random`, `Date.now`, or `performance.now`.
   The simulation always steps by `cfg.FIXED_DT`; main.ts owns the accumulator.
3. New tunables go in config.ts with a unit comment (px, px/s, seconds).
4. tsconfig has noUnusedLocals and noUnusedParameters on. Remove what you stop using.
5. Touch only the files listed in the task. If you believe another file must change,
   stop and say so instead of editing it.
6. Never edit: src/supabaseConfig.ts, .github/, package-lock.json by hand
   (it may change only as a result of `npm install <pkg>` when a task says to).
7. Do not add dependencies unless the task names them.
8. Do not refactor, rename, or reformat code the task does not mention.

## Working method
1. Read the task file, then read every file it lists in full before editing.
2. Make the smallest change that satisfies the acceptance criteria.
3. Run the checks listed in the task. Fix failures; do not weaken or delete tests.
4. Finish with: files changed, checks run and their result, anything left undone.
