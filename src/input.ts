// Input layer: gamepad (primary) with a keyboard + mouse fallback so the
// game is playable during development without a controller plugged in.
import { stick, Vec, v } from "./vec";
import { AIM_DEADZONE, MOVE_DEADZONE } from "./config";

export interface AimInput {
  /** True when we want to fire this frame. */
  firing: boolean;
  /** Direction to fire, normalized. */
  dir: Vec;
}

export class Input {
  private keys = new Set<string>();
  private mouseAim: Vec = v(640, 360);
  private mouseDown = false;
  private gpIndex: number | null = null;
  private prevLB = false;
  private prevRB = false;
  private prevBombGp = false;
  private bombQueued = false;
  private prevAnyButton = false;
  private prevMusicGp = false;
  private musicQueued = false;
  private prevPauseGp = false;
  private pauseQueued = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("gamepadconnected", (e) => {
      if (this.gpIndex === null) this.gpIndex = e.gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (this.gpIndex === e.gamepad.index) this.gpIndex = null;
    });

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "KeyB" || e.code === "KeyF") this.bombQueued = true;
      if (e.code === "KeyM") this.musicQueued = true;
      if (e.code === "Escape" || e.code === "KeyP") this.pauseQueued = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyB" || e.code === "KeyF") this.bombQueued = false;
      if (e.code === "KeyM") this.musicQueued = false;
      if (e.code === "Escape" || e.code === "KeyP") this.pauseQueued = false;
    });

    window.addEventListener("pointerdown", () => (this.mouseDown = true));
    window.addEventListener("pointerup", () => (this.mouseDown = false));
    window.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseAim = v(e.clientX - r.left, e.clientY - r.top);
    });
  }

  /** Reads current input. @param center where to resolve the aim-relative fallback. */
  read(center: Vec): { move: Vec; aim: AimInput } {
    const gp = this.gpIndex === null ? undefined : navigator.getGamepads()[this.gpIndex];

    if (gp) {
      const move = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0, MOVE_DEADZONE);
      const rawAim = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0, AIM_DEADZONE);
      return { move, aim: { firing: len(rawAim) > 0, dir: rawAim } };
    }

    // Keyboard fallback
    let mx = 0;
    let my = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) mx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) mx += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) my -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) my += 1;
    const move = v(Math.sign(mx), Math.sign(my));

    const aim = v(this.mouseAim.x - center.x, this.mouseAim.y - center.y);
    const l = Math.hypot(aim.x, aim.y) || 1;
    const dir = v(aim.x / l, aim.y / l);
    const firing =
      this.mouseDown || this.keys.has("Space") || this.keys.has("KeyJ");
    return { move, aim: { firing, dir } };
  }

  /** Edge-triggered gamepad shoulder buttons: +1 for right (RB), -1 for left (LB). */
  getWaveStep(): number {
    const gp = this.gpIndex === null ? undefined : navigator.getGamepads()[this.gpIndex];
    if (!gp) return 0;
    const lb = gp.buttons[4]?.pressed ?? false;
    const rb = gp.buttons[5]?.pressed ?? false;
    const step = (rb && !this.prevRB ? 1 : 0) - (lb && !this.prevLB ? 1 : 0);
    this.prevLB = lb;
    this.prevRB = rb;
    return step;
  }

  /** Edge-triggered bomb button: gamepad B (index 1) or keyboard B/F. */
  getBombPressed(): boolean {
    const gp = this.gpIndex === null ? undefined : navigator.getGamepads()[this.gpIndex];
    if (gp) {
      const b = gp.buttons[1]?.pressed ?? false;
      const edge = b && !this.prevBombGp;
      this.prevBombGp = b;
      return edge;
    }
    if (this.bombQueued) {
      this.bombQueued = false;
      return true;
    }
    return false;
  }

  /** Edge-triggered press of any gamepad button (used to restart on game over). */
  getAnyPress(): boolean {
    const gp = this.gpIndex === null ? undefined : navigator.getGamepads()[this.gpIndex];
    if (!gp) return false;
    let any = false;
    for (const b of gp.buttons) {
      if (b.pressed) {
        any = true;
        break;
      }
    }
    const edge = any && !this.prevAnyButton;
    this.prevAnyButton = any;
    return edge;
  }

  /** Edge-triggered music mute toggle: gamepad Y (index 3) or keyboard M. */
  getMusicToggle(): boolean {
    const gp = this.gpIndex === null ? undefined : navigator.getGamepads()[this.gpIndex];
    if (gp) {
      const b = gp.buttons[3]?.pressed ?? false;
      const edge = b && !this.prevMusicGp;
      this.prevMusicGp = b;
      return edge;
    }
    if (this.musicQueued) {
      this.musicQueued = false;
      return true;
    }
    return false;
  }

  /** Edge-triggered pause toggle: gamepad Start/menu (index 9) or Esc/P. */
  getPauseToggle(): boolean {
    const gp = this.gpIndex === null ? undefined : navigator.getGamepads()[this.gpIndex];
    if (gp) {
      const b = gp.buttons[9]?.pressed ?? false;
      const edge = b && !this.prevPauseGp;
      this.prevPauseGp = b;
      return edge;
    }
    if (this.pauseQueued) {
      this.pauseQueued = false;
      return true;
    }
    return false;
  }
}

function len(a: Vec): number {
  return Math.hypot(a.x, a.y);
}
