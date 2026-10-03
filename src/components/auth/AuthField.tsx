"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { ComponentProps } from "react";
import { TextField } from "@/components/ui/TextField";

export function AuthField({
  label,
  id,
  ...props
}: ComponentProps<"input"> & { label: string; id: string }) {
  const { t } = useI18n();
  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-control">
      {t(label)}
      <TextField id={id} {...props} />
    </label>
  );
}
