"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { Ref } from "react";

type Props = {
  ref?: Ref<HTMLButtonElement>;
  disabled: boolean;
  onEnter: () => void;
};

export function FlowerEntry({ ref, disabled, onEnter }: Props) {
  const { t } = useI18n();
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onEnter}
      aria-label={t("꽃을 눌러 대시보드로 이동")}
      data-dashboard-entry
      className="flower-entry fixed z-2 rounded-[50%] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
      style={{ visibility: "hidden" }}
    />
  );
}
