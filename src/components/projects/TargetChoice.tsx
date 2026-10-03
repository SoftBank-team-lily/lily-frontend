"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { CloudProvider, DeploymentMode, DeployTarget } from "@/lib/projects/types";

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
    description: "클라우드와 내 PC 를 오갈 수 있고, 넘친 요청은 고른 클라우드가 받아요.",
  },
  {
    value: "ONPREM_ONLY",
    label: "온프레미스 전용",
    description: "데이터는 내 PC 밖으로 나가지 않아요. 버스팅은 없고, PC 가 꺼지면 서비스도 멈춥니다.",
  },
];

const providers: { value: CloudProvider; label: string; description: string }[] = [
  {
    value: "AWS",
    label: "AWS",
    description: "Lily 의 AWS 클러스터에 배포해요. DB 는 RDS 입니다.",
  },
  {
    value: "GCP",
    label: "GCP",
    description: "Lily 의 GCP 클러스터에 배포해요. DB 는 Cloud SQL 입니다.",
  },
];

export function TargetChoice({
  value,
  onChange,
  mode = "HYBRID",
  onModeChange,
  provider = "AWS",
  onProviderChange,
}: {
  value: DeployTarget;
  onChange: (value: DeployTarget) => void;
  mode?: DeploymentMode;
  onModeChange?: (mode: DeploymentMode) => void;
  provider?: CloudProvider;
  onProviderChange?: (provider: CloudProvider) => void;
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
      {onProviderChange && mode !== "ONPREM_ONLY" && (
        <fieldset className="flex flex-col gap-2 text-control">
          <legend className="mb-2">{t("클라우드 제공자")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {providers.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line p-4 has-[:checked]:border-ink focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent"
              >
                <input
                  type="radio"
                  name="cloudProvider"
                  value={option.value}
                  checked={provider === option.value}
                  onChange={() => onProviderChange(option.value)}
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
