"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { DeploymentMode, DeployTarget } from "@/lib/projects/types";

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

const modes: { value: DeploymentMode; label: string; description: string }[] = [
  {
    value: "HYBRID",
    label: "하이브리드",
    description: "클라우드와 내 PC 를 오갈 수 있고, 넘친 요청은 클라우드가 받아요. DB 는 AWS 에 있어요.",
  },
  {
    value: "ONPREM_ONLY",
    label: "온프레미스 전용",
    description: "데이터는 내 PC 밖으로 나가지 않아요. 버스팅은 없고, PC 가 꺼지면 서비스도 멈춥니다.",
  },
];

export function TargetChoice({
  value,
  onChange,
  mode = "HYBRID",
  onModeChange,
}: {
  value: DeployTarget;
  onChange: (value: DeployTarget) => void;
  mode?: DeploymentMode;
  onModeChange?: (mode: DeploymentMode) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      {onModeChange && (
        <fieldset className="flex flex-col gap-2 text-control">
          <legend className="mb-2">{t("배포 모드")}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modes.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line p-4 has-[:checked]:border-ink focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent"
              >
                <input
                  type="radio"
                  name="deploymentMode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => onModeChange(option.value)}
                  className="sr-only"
                />
                <span className="font-semibold">{t(option.label)}</span>
                <span className="text-caption text-mute">{t(option.description)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {mode === "ONPREM_ONLY" ? null : (
    <fieldset className="flex flex-col gap-2 text-control">
      <legend className="mb-2">{t("거점")}</legend>
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
      )}
    </div>
  );
}
