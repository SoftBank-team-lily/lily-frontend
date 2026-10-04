"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import { overview } from "@/lib/projects/burst";
import type { Project } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";

/**
 * 온프레미스 앱의 지금 상태 한눈에: 공개 주소를 어디서 받는지, 내 PC·클라우드에 뭐가 떠 있는지, DB·버스팅,
 * 바로 손봐야 할 것과 에이전트의 마지막 기록.
 */
export function StatusOverview({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: (value: Project) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const view = overview(project);
  if (!view) return null;

  async function stopCloud() {
    setBusy(true);
    setError("");
    try {
      onUpdate(
        await projectRequest<Project>(
          `/api/projects/${project.id}/cloud/stop`,
          { method: "POST" },
        ),
      );
    } catch (problem) {
      setError(
        problem instanceof ProjectError
          ? problem.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    [t("내 PC"), view.pc],
    [t("클라우드"), view.cloud],
    ["DB", view.database],
    [t("버스팅"), view.burst],
  ];
  return (
    <section
      className="mt-4 rounded-xl border border-line p-4 text-caption"
      aria-label={t("지금 상태")}
    >
      <p className="text-mute">{t("지금 공개 주소를 받는 곳")}</p>
      <p
        className={`mt-1 text-lead font-semibold ${
          view.home.tone === "warning"
            ? "text-warning"
            : view.home.tone === "mute"
              ? "text-mute"
              : "text-ink"
        }`}
        aria-live="polite"
      >
        {t(view.home.label)}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-mute">{t(label)}</dt>
            <dd className="break-words text-ink">{t(value)}</dd>
          </div>
        ))}
      </dl>
      {view.warnings.map((warning) => (
        <div
          key={t(warning.text)}
          className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
            warning.tone === "danger"
              ? "border-danger text-danger"
              : "border-line text-warning"
          }`}
          role={warning.tone === "danger" ? "alert" : undefined}
        >
          <span>{t(warning.text)}</span>
          {warning.action === "stopCloud" && (
            <Button
              variant="ghost"
              className="h-10"
              disabled={busy}
              onClick={() => void stopCloud()}
            >
              {busy ? t("내리는 중…") : t("클라우드 Pod 내리기")}
            </Button>
          )}
        </div>
      ))}
      {view.recent.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-mute hover:text-ink">
            {t("에이전트 마지막 기록")}
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-mute">
            {view.recent.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="alert" className="mt-2 text-danger">
        {t(error)}
      </p>
    </section>
  );
}
