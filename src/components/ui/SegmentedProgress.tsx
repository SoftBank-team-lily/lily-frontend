"use client";

import { useI18n } from "@/lib/i18n/provider";
type Props = {
  segments: number;
  fractions: readonly number[];
  failedIndex?: number | null;
};

export function SegmentedProgress({ segments, fractions, failedIndex }: Props) {
  const { t } = useI18n();
  return (
    <ol
      aria-label={t("배포 단계 진행률")}
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${segments}, 1fr)` }}
    >
      {Array.from({ length: segments }, (_, index) => (
        <li
          key={index}
          className="relative h-0.75 overflow-hidden rounded-xs bg-line"
        >
          <i
            className={`absolute inset-0 transition-[width] duration-300 ease-linear motion-reduce:transition-none ${index === failedIndex ? "bg-rollback" : "bg-ink"}`}
            style={{
              width: `${Math.max(0, Math.min(1, fractions[index] ?? 0)) * 100}%`,
            }}
          />
        </li>
      ))}
    </ol>
  );
}
