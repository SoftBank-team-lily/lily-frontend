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

function CloudChoiceHint() {
  const { t } = useI18n();
  return (
    <span className="inline-flex">
      <button
        type="button"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line text-caption leading-none text-mute hover:text-ink"
        aria-label={t("클라우드 선택 기준")}
        aria-describedby="cloud-choice-criteria"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      <span className="pointer-events-none absolute top-full left-0 z-20 w-[calc(200%+0.75rem)] pt-2 opacity-0 group-hover/hint:pointer-events-auto group-hover/hint:opacity-100 group-focus-within/hint:pointer-events-auto group-focus-within/hint:opacity-100">
        <span id="cloud-choice-criteria" role="tooltip" className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-left text-caption text-mute shadow-lg">
          <span className="font-semibold text-ink">{t("클라우드 선택 기준")}</span>
          <span>{t("AWS 전용 라이브러리(S3, SQS 등)가 보이면 AWS를 골라요.")}</span>
          <span>{t("GCP 전용 라이브러리(BigQuery, Cloud Storage 등)가 보이면 GCP를 골라요.")}</span>
          <span>{t("웹이나 DB처럼 어느 쪽이든 되면 준비된 쪽을 고르고, 근거가 없으면 직접 고르게 해요.")}</span>
        </span>
      </span>
    </span>
  );
}

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
  {
    value: "MULTI",
    label: "AWS + GCP",
    description: "두 클러스터에 같이 띄우고 요청을 나눠요. DB 는 Cloud SQL 하나이고 PostgreSQL 만 돼요. 클라우드 배포만 됩니다.",
  },
];

export function TargetChoice({
  value,
  onChange,
  mode = "HYBRID",
  onModeChange,
  provider = "AWS",
  onProviderChange,
  selection = "auto",
  onSelectionChange,
}: {
  value: DeployTarget;
  onChange: (value: DeployTarget) => void;
  mode?: DeploymentMode;
  onModeChange?: (mode: DeploymentMode) => void;
  selection?: "auto" | "manual";
  onSelectionChange?: (value: "auto" | "manual") => void;
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
      {onSelectionChange && mode !== "ONPREM_ONLY" && <fieldset className="flex flex-col gap-2 text-control">
        <legend>{t("클라우드 선택 방식")}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(["auto", "manual"] as const).map((option) => (
            <div key={option} className={`relative flex items-center gap-2 rounded-xl border border-line p-4 has-[:checked]:border-ink focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent ${option === "auto" ? "group/hint" : ""}`}>
              <label className="flex flex-1 cursor-pointer whitespace-nowrap font-semibold">
                <input className="sr-only" type="radio" name="cloudSelection" value={option} checked={selection === option} onChange={() => onSelectionChange(option)} />
                {t(option === "auto" ? "자동 · JEV" : "수동 선택")}
              </label>
              {option === "auto" && <CloudChoiceHint />}
            </div>
          ))}
        </div>
        {selection === "auto" && <p className="text-caption text-mute">{t("JEV가 저장소 적합성을 판단해 AWS 또는 GCP를 선택해요. 판단을 보류하면 수동으로 선택할 수 있어요.")}</p>}
      </fieldset>}
      {onProviderChange && (!onSelectionChange || selection === "manual") && mode !== "ONPREM_ONLY" && (
        <fieldset className="flex flex-col gap-2 text-control">
          <legend className="mb-2">{t("클라우드 제공자")}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {providers.filter((option) => option.value !== "MULTI" || value === "cloud").map((option) => (
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
              onChange={() => {
                // AWS + GCP 는 클라우드 배포만. 내 PC 로 바꾸면 GCP 로 돌린다 (DB 가 있던 쪽)
                if (option.value === "onprem" && provider === "MULTI") onProviderChange?.("GCP");
                onChange(option.value);
              }}
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
