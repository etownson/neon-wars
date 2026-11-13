// Renderer: additive-composited neon drawing on a 2D canvas.
// Kept separate from the simulation so rendering can be swapped/optimized later.
import * as cfg from "./config";
import { PALETTE } from "./config";
import type { Game } from "./game";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private glowCanvas: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.glowCanvas = document.createElement("canvas");
    this.glowCtx = this.glowCanvas.getContext("2d")!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.glowCanvas.width = this.canvas.width;
    this.glowCanvas.height = this.canvas.height;
    this.glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(game: Game): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.drawGrid();

    // Everything with a glow draws into the offscreen buffer, which we then
    // composite additively ("lighter") over the grid for a bloom feel.
    const g = this.glowCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.drawGlowable(game, g);

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(this.glowCanvas, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }

  private drawGrid(): void {
    const { ctx, canvas } = this;
    ctx.strokeStyle = PALETTE.gridLine;
    ctx.lineWidth = 1;
    const step = 48;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    ctx.fillStyle = PALETTE.grid;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private drawGlowable(game: Game, g: CanvasRenderingContext2D): void {
    // Bullets
    g.fillStyle = PALETTE.bullet;
    for (const b of game.bullets) {
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
      g.fill();
    }

    // Chasers (angular seeker)
    g.strokeStyle = PALETTE.chaser;
    g.fillStyle = PALETTE.chaserGlow;
    for (const c of game.chasers) {
      this.drawChaser(g, c.pos.x, c.pos.y, c.radius, c.spin);
    }

    // Particles
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      g.globalAlpha = a;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Player
    if (game.player.alive) {
      this.drawPlayer(g, game.player.pos.x, game.player.pos.y);
    }
  }

  private drawChaser(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    spin: number
  ): void {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = spin + (i * Math.PI * 2) / 5;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  private drawPlayer(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.fillStyle = PALETTE.player;
    g.strokeStyle = PALETTE.playerGlow;
    const r = cfg.PLAYER_RADIUS;
    // Dart/triangle shape pointing to the right (aim is drawn in input layer).
    g.beginPath();
    g.moveTo(x + r * 1.4, y);
    g.lineTo(x - r * 0.8, y - r * 0.8);
    g.lineTo(x - r * 0.8, y + r * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
  }
}
