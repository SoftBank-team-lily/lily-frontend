"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { PlaceBadge } from "@/lib/projects/burst";
const badgeTone = {
  cloud: "border-cloud text-cloud",
  onprem: "border-onprem text-onprem",
  moving: "border-warning text-warning",
} as const;

/** 지금 공개 주소를 받는 곳. 색만으로 구분하지 않게 글자와 진행 막대를 같이 둔다 */
export function PlaceBadgeView({
  badge,
  large = false,
}: {
  badge: PlaceBadge;
  large?: boolean;
}) {
  const { t } = useI18n();
  const percent = badge.kind === "moving" ? badge.percent : null;
  return (
    <div
      className={`inline-flex flex-col gap-1 rounded-lg border px-3 py-1.5 ${badgeTone[badge.kind]}`}
      aria-live="polite"
    >
      <span className={`${large ? "text-lead" : "text-control"} font-semibold`}>
        {badge.kind === "cloud" ? "☁ " : badge.kind === "onprem" ? "🖥 " : "⇄ "}
        {t(badge.label)}
        {percent !== null && t(" · 약 {{value0}}%", { value0: percent })}
      </span>
      {percent !== null && (
        <span
          className="block h-1 w-full overflow-hidden rounded-full bg-field"
          aria-hidden="true"
        >
          <span
            className="block h-full bg-warning transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </div>
  );
}
