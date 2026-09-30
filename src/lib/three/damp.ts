export function damp(current: number, target: number, base: number, dt: number): number {
  return current + (target - current) * (1 - Math.pow(base, dt));
}
