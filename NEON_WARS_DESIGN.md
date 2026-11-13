# Neon Wars — Game Design Document

**Genre:** Browser-based twin-stick arena shooter
**Inspiration:** *Geometry Wars*
**Platform:** Web (WebGL / Web Audio), single player, gamepad-only controls

## Pitch
Neon Wars distills the instant-arena chaos of Geometry Wars into a minimal browser twin-stick shooter: survive escalating neon swarms, chain kills for multiplier score, and chase your high score.

## Design Pillars
1. **Instant readability** — high-contrast neon silhouettes and clear feedback keep threats readable in chaos.
2. **Precise simplicity** — 360° movement plus right-stick aim and auto-fire through a single input verb.
3. **Escalating flow** — waves, kill chains, and multipliers create constant forward pressure without a campaign.
4. **Juicy minimalism** — screen shake, hit-stop, particles, and sound sell the moment without extra mechanics.

## Core Fantasy
Players move with precise 360° freedom and aim with right-stick deflection, turning a crowded neon battlefield into fast, readable combat.

## Platform & Scope
- Browser (WebGL), single player.
- Minimal scope: one arena, focused mechanics, score-attack structure.

## Core Loop
1. Face escalating waves of enemies.
2. Fight, dodge, and survive.
3. Chain kills to build a score multiplier.
4. Push further for high score / survival time.

## Controls
- Move: left stick
- Aim & fire: right stick deflection past a dead zone (auto-fires)
- No keyboard/mouse or dedicated fire button required.

## Geometry Wars–Inspired Mechanics
- Smooth vector-style movement and collision for tight dodging.
- Enemy archetypes:
  - **Chaser** — hunts the player.
  - **Shooter** — keeps distance and fires aimed bursts.
  - **Splitter** — splits into faster, smaller enemies on death (+ score bonus).
  - **Black hole** — passive hazard that pulls in nearby enemies/players; lethal on contact.
- Kill-streak score multiplier; resets on death.

## Player & Weapons
- Player: small neon interceptor with two weapons.
  - **Rapid pistol** — accurate, low per-shot damage, high fire rate (starter).
  - **Spread rifle** — wide spread, higher per-shot damage (unlockable).

## Progression
### In-run: wave structure & difficulty
- Endless score-attack format; difficulty escalates continuously.
- Composition ladder:
  - Waves 1–3: chasers.
  - Waves 4–6: chasers + shooters.
  - Waves 7–8: add splitters.
  - Wave 9+: add black holes.
- Scaling: increase active enemy count per wave; escalate enemy speed/fire rate with wave number.

### Meta progression (v1)
- Unlock spread rifle at a score milestone / first wave clear.
- Cosmetic ship variants.

## Scoring
### Kill-streak multiplier
- Starts at x1.0; doubles every 5 consecutive kills; caps at x8. Resets on death.

### Scoring table

| Source | Base Points | Multiplier | Notes |
|--------|-------------|------------|-------|
| Chaser kill | 100 | ×M | Core score source. |
| Shooter kill | 150 | ×M | Ranged threat; higher value. |
| Splitter kill | 250 | ×M | +50% split bonus for triggering kill. |

### Split bonus
- Splitter grants 250 × M + 50%. Children are smaller/faster with reduced base score (e.g., 50) when destroyed.

## Art & Audio Design
### Visual
- Neon glow, grid arena, additive particles, synth-style palette.
- Palette: deep navy background (#050510); neon cyan (#00F0FF); neon magenta (#FF2A6D); electric blue (#05D9E8); amber accent (#FFB800) for splitters.
- Arena: neon grid plane, cyan lines at low alpha.
- Enemies:
  - Chaser: angular seeker, cyan.
  - Shooter: orb/turret, magenta.
  - Splitter: hexagon, amber; splits into smaller chasers.
  - Black hole: dark vortex with glowing accretion ring, magenta/cyan.

### Audio
- Retro synth / synthwave; Web Audio synthesized SFX.
- Music: ambient synth pad + arpeggio; intensity rises with wave.
- SFX:
  - Shoot: laser zap.
  - Enemy hit: low tick.
  - Kill: bright sweep + noise burst.
  - Split: glitchy descending tone.
  - Black hole: rumble + whistle.
  - Player death: descending saw sweep.