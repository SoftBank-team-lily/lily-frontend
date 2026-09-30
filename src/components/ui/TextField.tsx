import type { ComponentProps } from "react";

export function TextField({
  className = "",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      type="text"
      autoComplete="off"
      spellCheck={false}
      className={`min-w-0 flex-1 rounded-xl border border-line bg-field px-4 py-3.5 text-input text-ink outline-none placeholder:text-mute focus-visible:border-ink ${className}`}
      {...props}
    />
  );
}
