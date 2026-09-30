import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & { variant?: "primary" | "ghost" };

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const appearance = variant === "primary"
    ? "bg-ink text-surface max-[641px]:h-12"
    : "h-10 border border-line bg-transparent text-ink";
  return <button type="button" className={`rounded-xl px-5 text-control font-semibold disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent ${appearance} ${className}`} {...props} />;
}
