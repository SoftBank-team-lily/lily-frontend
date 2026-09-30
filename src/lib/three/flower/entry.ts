import { CAMERA, FLOWER_ENTRY } from "./config";
import type { View } from "./fitView";

export type EntryControls = {
  enter: (onComplete: () => void) => void;
  return: (onComplete: () => void) => void;
};

export type FlowerArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function entryView(center: View["look"], aspect: number): View {
  const distance = Math.max(
    FLOWER_ENTRY.radius /
      (Math.tan((CAMERA.fov * Math.PI) / 360) * Math.min(1, aspect)),
    CAMERA.near + FLOWER_ENTRY.clearance,
  );
  return {
    cam: [center[0], center[1], center[2] + distance],
    look: [...center],
  };
}

export function entryEase(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

export function blendView(from: View, to: View, progress: number): View {
  const t = entryEase(progress);
  const mix = (a: View["cam"], b: View["cam"]): View["cam"] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  return { cam: mix(from.cam, to.cam), look: mix(from.look, to.look) };
}
