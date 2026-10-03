"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { DeployTarget } from "@/lib/projects/types";

const options: { value: DeployTarget; label: string; description: string }[] = [
  {
    value: "cloud",
    label: "클라우드",
    description: "Lily 클러스터에 배포해요.",
  },
  {
    value: "onprem",
    label: "온프레미스",
    description:
      "직접 운영하는 서버(PC)의 에이전트가 띄우고 공개 주소를 받아요.",
  },
];

export function TargetChoice({
  value,
  onChange,
}: {
  value: DeployTarget;
  onChange: (value: DeployTarget) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="flex flex-col gap-2 text-control">
      <legend className="mb-2">{t("배포 위치")}</legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line p-4 has-[:checked]:border-ink focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent"
          >
            <input
              type="radio"
              name="target"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="font-semibold">{t(option.label)}</span>
            <span className="text-caption text-mute">
              {t(option.description)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
