import type { ComponentProps } from "react";
import { TextField } from "@/components/ui/TextField";

export function AuthField({
  label,
  id,
  ...props
}: ComponentProps<"input"> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-control">
      {label}
      <TextField id={id} {...props} />
    </label>
  );
}
