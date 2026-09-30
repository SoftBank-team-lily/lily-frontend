"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { HERO_DELAY } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";

export function Reveal({
  className = "",
  children,
  ...props
}: ComponentProps<"section">) {
  const reduce = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setReady(true),
      Math.max(0, HERO_DELAY - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <section
      data-visible={ready || reduce}
      className={`reveal ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}
