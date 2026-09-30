"use client";

import { useEffect, useRef } from "react";
import { FlowerScene } from "@/lib/three/flower/FlowerScene";
import type { FlowerSlot } from "@/lib/three/flower/fitView";
import type { FlowerTargets } from "@/lib/deploy/types";

const idle: FlowerTargets = { progress: 0, wilt: 0 };
type Props = { getSlot: () => FlowerSlot; reducedMotion: boolean; targets?: FlowerTargets };

export default function FlowerCanvasClient({ getSlot, reducedMotion, targets = idle }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FlowerScene | null>(null);
  useEffect(() => {
    if (!host.current) return;
    // 해제된 WebGL 컨텍스트가 남은 canvas를 StrictMode에서 재사용하지 않습니다.
    const canvas = document.createElement("canvas");
    canvas.id = "gl"; canvas.className = "block h-full w-full"; canvas.setAttribute("aria-hidden", "true");
    host.current.append(canvas);
    let instance: FlowerScene;
    try {
      instance = new FlowerScene({ canvas, getSlot, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
      scene.current = instance;
    } catch (error) {
      console.warn("꽃 캔버스를 초기화하지 못했습니다.", error);
      canvas.dataset.state = "unavailable";
      return () => canvas.remove();
    }
    return () => { instance.dispose(); scene.current = null; canvas.remove(); };
  }, [getSlot]);
  useEffect(() => { scene.current?.setTargets(targets); }, [targets, getSlot]);
  useEffect(() => { scene.current?.setReducedMotion(reducedMotion); }, [reducedMotion, getSlot]);
  return <div ref={host} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
