"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntryControls } from "@/lib/three/flower/entry";
import type { DeployResult } from "@/lib/deploy/types";
import type { DashboardHandler, EntryCheck } from "@/lib/dashboard/types";

type Phase = "idle" | "checking" | "zooming" | "entering" | "returning";

type Options = {
  reducedMotion: boolean;
  flowerAvailable: boolean;
  blocked: boolean;
  result: DeployResult | null;
  onEnterDashboard?: DashboardHandler;
  beforeEnter?: () => Promise<EntryCheck>;
  projectId?: string;
};

export function useDashboardEntry({
  reducedMotion,
  flowerAvailable,
  blocked,
  result,
  onEnterDashboard,
  beforeEnter,
  projectId,
}: Options) {
  const [phase, setPhase] = useState<Phase>("idle");
  const current = useRef<Phase>("idle");
  const controls = useRef<EntryControls | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const focus = useRef<HTMLElement | null>(null);
  const focusFrame = useRef(0);
  const [message, setMessage] = useState("");
  const changePhase = useCallback((next: Phase) => {
    current.current = next;
    if (mounted.current) setPhase(next);
  }, []);
  useEffect(() => {
    generation.current++;
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  const restore = useCallback(() => {
    if (!mounted.current) return;
    changePhase("returning");
    const complete = () => {
      if (!mounted.current) return;
      changePhase("idle");
      focusFrame.current = requestAnimationFrame(() => {
        const previous = focus.current;
        const usable =
          previous?.isConnected &&
          !(previous instanceof HTMLButtonElement && previous.disabled);
        const target = usable
          ? previous
          : document.querySelector<HTMLElement>(
              "[data-dashboard-entry]:not(:disabled)",
            );
        target?.focus({ preventScroll: true });
      });
    };
    if (controls.current) controls.current.return(complete);
    else complete();
  }, [changePhase]);
  const enter = useCallback(async () => {
    if (
      !mounted.current ||
      current.current !== "idle" ||
      blocked ||
      result?.outcome !== "succeeded"
    )
      return;
    const successfulResult = { ...result, outcome: "succeeded" as const };
    cancelAnimationFrame(focusFrame.current);
    const run = ++generation.current;
    const isCurrent = () => mounted.current && generation.current === run;
    focus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMessage("");
    if (beforeEnter) {
      changePhase("checking");
      try {
        const check = await beforeEnter();
        if (!isCurrent()) return;
        if (!check.allowed) {
          setMessage(check.message ?? "");
          restore();
          return;
        }
      } catch {
        if (isCurrent()) {
          setMessage("진입 권한을 확인하지 못했어요. 다시 시도해 주세요.");
          restore();
        }
        return;
      }
    }
    if (!isCurrent()) return;
    changePhase("zooming");
    const complete = async () => {
      if (!isCurrent() || current.current !== "zooming") return;
      changePhase("entering");
      try {
        if (onEnterDashboard) {
          await onEnterDashboard({
            source: "flower",
            result: successfulResult,
            ...(projectId ? { projectId } : {}),
          });
        } else {
          setMessage("대시보드 연결 준비 중입니다.");
        }
      } catch {
        if (isCurrent())
          setMessage("대시보드로 이동하지 못했어요. 다시 시도해 주세요.");
      } finally {
        if (isCurrent()) restore();
      }
    };
    if (controls.current && flowerAvailable && !reducedMotion) {
      controls.current.enter(() => {
        void complete();
      });
    } else {
      void complete();
    }
  }, [
    blocked,
    beforeEnter,
    changePhase,
    flowerAvailable,
    onEnterDashboard,
    reducedMotion,
    restore,
    result,
    projectId,
  ]);
  useEffect(() => {
    function cancel(event: KeyboardEvent) {
      if (event.key === "Escape" && current.current === "zooming") {
        event.preventDefault();
        restore();
      }
    }
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [restore]);
  const clearMessage = useCallback(() => setMessage(""), []);
  return {
    phase,
    controls,
    enter,
    message,
    clearMessage,
    busy: phase !== "idle",
  };
}
