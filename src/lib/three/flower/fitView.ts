import { CAMERA, FLOWER } from "./config";

export type FlowerSlot = { top: number; bottom: number };
type Options = { slot: FlowerSlot; viewport: { width: number; height: number }; fov: number };
export type View = { cam: [number, number, number]; look: [number, number, number] };

export function fitView({ slot, viewport, fov }: Options): View {
  const aspect = viewport.width / viewport.height;
  const top = 1 - 2 * slot.top / viewport.height;
  const bottom = 1 - 2 * slot.bottom / viewport.height;
  const center = (top + bottom) / 2;
  const extent = Math.max(0.1, (top - bottom) / 2);
  const half = Math.max(FLOWER.hh * CAMERA.margin / extent, FLOWER.hw * CAMERA.margin / (CAMERA.width * aspect));
  const y = FLOWER.cy - center * half;
  return { cam: [FLOWER.cx, y, half / Math.tan(fov / 2 * Math.PI / 180)], look: [FLOWER.cx, y, 0] };
}
