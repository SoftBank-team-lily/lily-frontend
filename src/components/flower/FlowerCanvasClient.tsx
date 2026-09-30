"use client";

import { useEffect, useRef, type RefObject } from "react";
import { FlowerEntry } from "./FlowerEntry";
import type { EntryControls, FlowerArea } from "@/lib/three/flower/entry";
import { FlowerScene } from "@/lib/three/flower/FlowerScene";
import type { FlowerSlot } from "@/lib/three/flower/fitView";
import type { FlowerTargets } from "@/lib/deploy/types";

const idle: FlowerTargets = { progress: 0, wilt: 0 };
type Props = {
  getSlot: () => FlowerSlot;
  reducedMotion: boolean;
  targets?: FlowerTargets;
  controlsRef?: RefObject<EntryControls | null>;
  entryDisabled?: boolean;
  getEntrySlot?: () => FlowerSlot;
  onEnter?: () => void;
  onAvailable?: (available: boolean) => void;
};

export default function FlowerCanvasClient({
  getSlot,
  reducedMotion,
  targets = idle,
  controlsRef,
  entryDisabled = true,
  getEntrySlot,
  onEnter,
  onAvailable,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FlowerScene | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ getEntrySlot, onAvailable });
  useEffect(() => {
    callbacks.current = { getEntrySlot, onAvailable };
  }, [getEntrySlot, onAvailable]);
  useEffect(() => {
    if (!host.current) return;
    // 해제된 WebGL 컨텍스트가 남은 canvas를 StrictMode에서 재사용하지 않습니다.
    const canvas = document.createElement("canvas");
    canvas.id = "gl";
    canvas.className = "block h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    host.current.append(canvas);
    let instance: FlowerScene;
    try {
      instance = new FlowerScene({
        canvas,
        getSlot,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
        onEntryProgress: (opacity) => {
          if (fade.current) fade.current.style.opacity = String(opacity);
        },
        onAvailable: (available) => callbacks.current.onAvailable?.(available),
        onArea: (area: FlowerArea) => {
          const element = button.current;
          if (!element) return;
          const slot = callbacks.current.getEntrySlot?.() ?? getSlot();
          const top = Math.max(slot.top, area.top, 0);
          const bottom = Math.min(
            slot.bottom,
            area.top + area.height,
            window.innerHeight,
          );
          const left = Math.max(0, area.left);
          const right = Math.min(window.innerWidth, area.left + area.width);
          element.style.left = `${left}px`;
          element.style.top = `${top}px`;
          element.style.width = `${Math.max(0, right - left)}px`;
          element.style.height = `${Math.max(0, bottom - top)}px`;
          element.style.visibility =
            bottom > top && right > left ? "visible" : "hidden";
        },
      });
      scene.current = instance;
      if (controlsRef)
        controlsRef.current = {
          enter: (complete) => instance.enter(complete),
          return: (complete) => instance.returnFromEntry(complete),
        };
    } catch (error) {
      console.warn("꽃 캔버스를 초기화하지 못했습니다.", error);
      canvas.dataset.state = "unavailable";
      callbacks.current.onAvailable?.(false);
      return () => canvas.remove();
    }
    return () => {
      instance.dispose();
      scene.current = null;
      if (controlsRef) controlsRef.current = null;
      canvas.remove();
    };
  }, [getSlot, controlsRef]);
  useEffect(() => {
    scene.current?.setTargets(targets);
  }, [targets, getSlot]);
  useEffect(() => {
    scene.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, getSlot]);
  return (
    <>
      <div
        ref={host}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      <FlowerEntry
        ref={button}
        disabled={entryDisabled}
        onEnter={() => onEnter?.()}
      />
      <div
        ref={fade}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-surface opacity-0"
      />
    </>
  );
}
