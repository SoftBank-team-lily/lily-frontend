"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntryControls } from "@/lib/three/flower/entry";

type Phase = "idle" | "zooming" | "entering" | "returning";

export function useDashboardEntry() {
  const [phase, setPhase] = useState<Phase>("idle");
  const current = useRef<Phase>("idle");
  const controls = useRef<EntryControls | null>(null);
  const mounted = useRef(false);
  const focus = useRef<HTMLElement | null>(null);
  const focusFrame = useRef(0);
  const [message, setMessage] = useState("");
  const changePhase = useCallback((next: Phase) => {
    current.current = next;
    if (mounted.current) setPhase(next);
  }, []);
  useEffect(() => {
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
        if (focus.current?.isConnected)
          focus.current.focus({ preventScroll: true });
      });
    };
    if (controls.current) controls.current.return(complete);
    else complete();
  }, [changePhase]);
  const enter = useCallback(() => {
    if (!mounted.current || current.current !== "idle") return;
    focus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMessage("");
    changePhase("zooming");
    const complete = () => {
      if (!mounted.current || current.current !== "zooming") return;
      changePhase("entering");
      setMessage("대시보드 연결 준비 중입니다.");
      restore();
    };
    if (controls.current) controls.current.enter(complete);
    else complete();
  }, [changePhase, restore]);
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
  return { phase, controls, enter, message, busy: phase !== "idle" };
}
