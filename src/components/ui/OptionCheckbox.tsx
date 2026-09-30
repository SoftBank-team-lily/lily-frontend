import type { ComponentProps, ReactNode } from "react";

type Props = Omit<ComponentProps<"input">, "type"> & { children: ReactNode };

export function OptionCheckbox({ children, ...props }: Props) {
  return <label className="mt-3.5 inline-flex cursor-pointer items-center gap-2 text-caption text-mute focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent"><input type="checkbox" className="accent-danger m-[4px_3px_3px_4px] [color-scheme:light]" {...props} />{children}</label>;
}
