// Tiny 2D vector helpers — kept dependency-free on purpose.

export interface Vec {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec => ({ x, y });

export const len = (a: Vec): number => Math.hypot(a.x, a.y);

export const norm = (a: Vec): Vec => {
  const l = len(a);
  if (l < 1e-6) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
};

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

// Normalize an analog stick reading and apply a circular dead zone.
export function stick(
  x: number,
  y: number,
  deadzone: number = 0.2
): Vec {
  const l = len({ x, y });
  if (l <= deadzone) return { x: 0, y: 0 };
  const m = (l - deadzone) / (1 - deadzone);
  return { x: (x / l) * m, y: (y / l) * m };
}
