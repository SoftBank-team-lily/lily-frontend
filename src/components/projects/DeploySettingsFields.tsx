"use client";

import { useI18n } from "@/lib/i18n/provider";
import { AuthField } from "@/components/auth/AuthField";

/**
 * 배포 설정 칸. 모두 비워도 배포된다 (lily-builder 가 레포를 보고 정한다).
 * Dockerfile 이 없어도 Spring·Node·Python·Go 앱이면 자동으로 만들어 빌드한다.
 */
export function DeploySettingsFields() {
  const { t } = useI18n();
  return (
    <details className="group rounded-xl border border-line px-4 py-3 text-left">
      <summary className="cursor-pointer text-control text-mute group-open:text-ink">
        {t("배포 설정 (선택)")}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-caption text-mute">
          {t(
            "비워 두면 레포를 보고 정해요. Dockerfile이 없어도 Spring, Node, Python, Go 앱이면 자동으로 만들어 빌드해요.",
          )}
        </p>
        <AuthField
          id="settings-root-dir"
          name="rootDir"
          label={t("앱 폴더")}
          maxLength={200}
          placeholder={t("레포 루트 (예: backend, apps/web)")}
        />
        <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
          <AuthField
            id="settings-branch"
            name="branch"
            label={t("브랜치")}
            maxLength={200}
            placeholder={t("기본 브랜치")}
          />
          <AuthField
            id="settings-port"
            name="port"
            label={t("포트")}
            inputMode="numeric"
            maxLength={5}
            placeholder={t("자동")}
          />
        </div>
        <AuthField
          id="settings-health"
          name="healthPath"
          label={t("헬스 체크 경로")}
          maxLength={200}
          placeholder={t("/ (Spring actuator가 있으면 자동)")}
        />
        <div className="flex flex-col gap-2 text-control">
          <label htmlFor="settings-env">{t("환경변수")}</label>
          <textarea
            id="settings-env"
            name="env"
            rows={4}
            spellCheck={false}
            aria-describedby="settings-env-hint"
            placeholder={"JWT_SECRET=...\nVITE_API_URL=https://..."}
            className="min-w-0 rounded-xl border border-line bg-field px-4 py-3 font-mono text-caption text-ink outline-none placeholder:text-mute focus-visible:border-ink"
          />
          <span id="settings-env-hint" className="text-caption text-mute">
            {t(
              "한 줄에 KEY=VALUE. DB 주소는 자동으로 넣어 줘요. VITE_, NEXT_PUBLIC_ 로 시작하는 값은 빌드할 때도 넣어요.",
            )}
          </span>
        </div>
      </div>
    </details>
  );
}
