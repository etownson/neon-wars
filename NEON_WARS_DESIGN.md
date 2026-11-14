# Neon Wars — Game Design Document

This document describes the game **as implemented**. Numbers are quoted from
`src/config.ts` with their constant names; if the two ever disagree, `config.ts` is
correct and this document is out of date.

- **Genre:** browser twin-stick arena shooter, single player, endless score attack
- **Inspiration:** *Geometry Wars*
- **Tech:** TypeScript, Vite, Canvas 2D, Web Audio (all sound synthesized), optional
  Supabase leaderboard. No runtime dependencies, no asset files.
- **Simulation:** fixed timestep of `FIXED_DT` (1/240 s) regardless of display refresh rate.
  All simulation randomness comes from an injected seeded RNG, so a seed plus an input
  sequence reproduces a run exactly. `npm test` runs it headlessly.

## Design pillars
1. **Instant readability** — high-contrast neon shapes; every threat has its own colour and silhouette.
2. **Precise simplicity** — move, aim, and one bomb button. Aiming is firing.
3. **Escalating flow** — a new wave every 15 seconds, kill chains, and a multiplier keep pressure rising.
4. **Juicy minimalism** — screen shake, hit-stop, particles, and sound sell each hit without extra mechanics.

## Core loop
1. Press any key or button on the start screen.
2. Survive enemies that spawn at the arena edges; waves advance on a timer.
3. Chain kills without dying to raise the multiplier (up to x20).
4. Collect dropped pickups: spread rifle, bombs, extra lives.
5. Lose all lives → game over → optionally submit initials → restart.

## Arena
- The arena is the browser window; it resizes with the window.
- The player and enemies are confined to the window inset by `WORLD_MARGIN` (60 px).
  The player is clamped; enemies bounce off the boundary.
- Bullets are not confined; they expire by lifetime.

## Controls

| Action | Gamepad | Keyboard / mouse |
|---|---|---|
| Move | Left stick (dead zone `MOVE_DEADZONE` 0.2) | WASD or arrow keys |
| Aim and fire | Right stick past dead zone `AIM_DEADZONE` 0.25 | Aim with mouse; hold mouse button, Space, or J |
| Bomb | B (button 1) | B or F |
| Pause | Start (button 9) | Esc or P |
| Toggle music | Y (button 3) | M |
| Start / restart | Any button | Any key, or click |

When a gamepad is connected it takes over; keyboard and mouse are the fallback.
There is no separate fire button on gamepad: deflecting the right stick fires.

## Player
- Radius `PLAYER_RADIUS` 10 px. Starts and respawns at the arena centre.
- Movement: velocity eases toward stick × `PLAYER_SPEED` (600 px/s) at rate `PLAYER_RESPONSE`
  (9 /s), reaching 63% of target speed in about 0.11 s. Velocity plus black-hole pull is
  capped at `PLAYER_MAX_SPEED` (660 px/s).
- The ship faces the aim direction and keeps its last facing when not aiming.
- One hit kills: contact with any enemy (including a black hole) or any enemy bullet.

### Weapons
- **Pistol (default):** `FIRE_RATE` 8 shots/s, one bullet per shot.
- **Spread rifle (timed pickup):** same fire rate, `SPREAD_BULLETS` 5 bullets in a
  `SPREAD_ANGLE` 0.9 rad fan, for `SPREAD_DURATION` 14 s. Picking up another resets the timer. Lost on death.
- Bullets: speed `BULLET_SPEED` 620 px/s, radius 3 px, lifetime 1.1 s, 1 damage, destroyed on hit.

### Lives, death, respawn
- `LIVES_START` 3, `LIVES_MAX` 6.
- On death: streak and multiplier reset, spread rifle ends, enemies within
  `DEATH_CLEAR_RADIUS` (220 px) are removed with no score, one life is lost.
- Respawn after `RESPAWN_TIME` 1.0 s with `SPAWN_INVULN` 2.0 s of invulnerability (ship blinks).
  No enemies spawn while the player is dead.
- At 0 lives the run ends and the simulation freezes.

### Bomb
- `BOMBS_START` 0, `BOMBS_MAX` 3. Gained only from pickups.
- Detonating removes every enemy (black holes included) and every enemy bullet.
- Every removed enemy scores its base points × the multiplier in effect at the moment of
  detonation; the multiplier does not climb during the blast.
- Removed enemies still count toward kills and the streak, so the multiplier is recalculated
  once afterward and the next kill benefits.
- Bomb kills give no split bonus, spawn no minions, and drop no pickups.
- Cannot be used while dead, paused, or after game over.

## Enemies
All non-black-hole enemies have `ENEMY_HP` 1 HP. Speeds and shooter fire rate are multiplied by the wave scale (see Waves).

| Kind | Radius | Base speed | Colour | Behaviour |
|---|---|---|---|---|
| Chaser | 12 | `CHASER_SPEED` 120 | cyan #00f0ff | Accelerates toward the player (`CHASER_ACCEL` 260). |
| Shooter | 13 | `SHOOTER_SPEED` 90 | magenta #ff2a6d | Holds `SHOOTER_RANGE` 300 px (±40): approaches if farther, retreats if nearer, strafes inside the band (see Known quirks for how often it reverses). Fires one aimed bullet every `SHOOTER_FIRE_INTERVAL` 2.1 s (first shot after `SHOOTER_FIRST_SHOT` 1.2 s) when within `SHOOTER_FIRE_RANGE` 480 px. |
| Splitter | 14 | `SPLITTER_SPEED` 85 | amber #ffb800 | Seeks the player slowly (`SPLITTER_ACCEL` 208). On death releases `SPLITTER_CHILDREN` 3 minions outward at `MINION_SPLIT_SPEED` 95 px/s. |
| Minion | 7 | `MINION_SPEED` 190 | electric blue #05d9e8 | Fast seeker (`MINION_ACCEL` 420). Only created by splitters. |
| Black hole | 26 | `BLACKHOLE_DRIFT` 16 | magenta ring, dark core | Cannot be shot. Drifts and bounces. Expires after `BLACKHOLE_LIFE` 9 s. |

- Enemy bullets: speed `ENEMY_BULLET_SPEED` 210 px/s, radius 4 px, lifetime 4 s.
- Black hole pull: within `BLACKHOLE_PULL_RADIUS` 280 px, acceleration
  `BLACKHOLE_PULL_STRENGTH` 775 px/s² scaled linearly to zero at the edge of the radius.
  It pulls the player and all other enemies. The player's accumulated pull decays at
  `PLAYER_GRAV_DAMP` 3 /s once out of range.

## Waves and difficulty
- A wave lasts `WAVE_TIME` 15 s, purely on a timer; there is no "clear the wave" condition.
- The first enemy spawns `FIRST_SPAWN_DELAY` (1 s) into a run.
- Enemies spawn one at a time at a random point on the arena edge, at least
  `SPAWN_MIN_DIST` 240 px from the player.

| Scaling | Formula | Limit reached |
|---|---|---|
| Max enemies alive | `ENEMY_CAP_BASE` 4 + wave, capped at `ENEMY_CAP_MAX` 22 | wave 18 |
| Spawn interval | 1.6 s − 0.09 s × (wave − 1), minimum 0.45 s | wave 14 |
| Speed and fire-rate scale | 1 + 0.05 × (wave − 1), maximum 1.7 | wave 15 |

Spawn mix by wave (`SPAWN_MIX`; each entry applies from its first wave onward):

| Waves | Chaser | Shooter | Splitter | Black hole |
|---|---|---|---|---|
| 1–3 | 100% | | | |
| 4–6 | 70% | 30% | | |
| 7–8 | 45% | 30% | 25% | |
| 9+ | 40% | 25% | 20% | 15% |

## Pickups
- Each enemy destroyed by a bullet has a `PICKUP_SPAWN_CHANCE` 8% chance to drop one.
- Kind (`PICKUP_WEIGHTS`): spread rifle 50%, bomb 30%, extra life 20%.
- At most `PICKUP_MAX_ON_FIELD` 4 at once; each despawns after `PICKUP_DESPAWN` 10 s.
- Collected by touch (pickup radius 12 px). A bomb or life collected at its maximum is consumed with no effect.

## Scoring

| Source | Base points |
|---|---|
| Chaser | 100 |
| Shooter | 150 |
| Splitter | 250, then +50% (`SPLIT_BONUS`) when shot |
| Minion | 50 |
| Black hole (bomb only) | 0 |

- Points awarded = base × multiplier (× 1.5 for a shot splitter), rounded.
  The multiplier used is the one in effect before the kill.
- Multiplier: `1 + floor(19 × (streak / 50)^0.9)`, capped at `MAX_MULTIPLIER` 20,
  where streak is kills since the last death.

| Streak | 1 | 2 | 5 | 10 | 20 | 25 | 40 | 50+ |
|---|---|---|---|---|---|---|---|---|
| Multiplier | x1 | x2 | x3 | x5 | x9 | x11 | x16 | x20 |

- The best score is kept in the browser's localStorage under `neon-wars-best`.

## Screens and HUD
- **Start screen:** title, blurb, controls, pickup and enemy legend. Any key, click, or button begins the run.
- **HUD:** wave, score, best score, multiplier, bombs, life dots, spread-rifle countdown.
- **Pause:** freezes the simulation and shows an overlay.
- **Game over:** final score, initials entry, top-10 leaderboard, restart prompt.
- **Debug:** adding `?debug` to the URL enables wave jumping (number keys, or LB/RB on gamepad).

## Leaderboard
- Optional. Enabled only when `src/supabaseConfig.ts` holds a project URL and anon key;
  otherwise the game hides the entry form. Setup is in `docs/SUPABASE_SETUP.md`.
- A run with a score above 0 may submit 1–3 characters (A–Z, 0–9) with its score and wave.
- Shows the top 10 by score; ties go to the earlier entry.

## Visual design
- Background deep navy #050510 with a low-alpha cyan grid.
- Bullets, enemies, pickups, particles, and the player are drawn to an offscreen canvas
  and composited additively for the glow.
- Player bullets cyan #00f0ff; enemy bullets magenta #ff2a6d.
- Kills burst into `KILL_PARTICLES` 14 particles in the enemy's colour; bomb clears use `BOMB_PARTICLES` 8,
  death clears `DEATH_CLEAR_PARTICLES` 6, and pickups `PICKUP_PARTICLES` 10.

### Feedback

| Event | Screen shake (0–1) | Hit-stop |
|---|---|---|
| Fire | 0.025 | |
| Kill | 0.12 | 0.03 s |
| Splitter kill | 0.30 more | 0.05 s |
| Death | 0.60 | 0.14 s |
| Bomb | 1.0 | 0.12 s, plus a white flash |

Shake decays at `SHAKE_DECAY` 6 /s; full shake offsets the view by up to `SHAKE_PX` 18 px.

## Audio
All synthesized with Web Audio; starts on the first user input.
- **Music:** minor-pentatonic arpeggio at 92 BPM, rising to 147 BPM and up an octave as waves
  advance (full intensity at wave 10). Can be muted.
- **SFX:** shoot, kill, split, player death, pickup chime, extra-life arpeggio, bomb boom,
  wave-up sting, black hole spawn, and a continuous rumble while any black hole is alive.

## Known quirks
Behaviour that is in the code today and may not be intended. Do not change these unless a task says to.
- **Shooters reverse strafe about once a second, not every 2–4 s.** The strafe direction is
  the sign of `sin(spin)`, and `spin` also rotates continuously at `ENEMY_SPIN_SPEED` 3 rad/s,
  so the sign flips roughly every 1.05 s. The `SHOOTER_STRAFE_FLIP_MIN`/`MAX` timer adds an
  extra flip on top.
