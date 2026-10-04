"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { projectRequest } from "@/lib/projects/client";
import { useFixProgress } from "@/lib/remediate/useFixProgress";
import { fixStages, type FixRun, type FixStage } from "@/lib/remediate/types";

const stages: Record<FixStage, string> = {
  accepted: "장애 확인",
  drafting: "수정안 생성·검사",
  checking: "변경 경로 확인",
  "opening-pr": "수정 PR 생성",
  review: "검토 대기",
};
const statuses: Record<FixRun["status"], string> = {
  running: "수정 진행 중", review: "PR 검토 대기", skipped: "수정 보류", failed: "수정 작업 실패",
};
const reasons: Record<string, string> = {
  consent: "프로젝트의 AI 수정 허용을 켜 주세요.",
  github: "GitHub App을 연결해 주세요.",
  commit: "배포 커밋을 확인하지 못했어요. 새로 배포한 뒤 다시 확인해 주세요.",
  duplicate: "같은 장애의 수정 PR이 이미 열려 있어요.",
  "no-files": "장애 로그에서 수정할 파일을 찾지 못했어요.",
  "not-code": "코드 수정으로 해결할 장애로 판단되지 않았어요.",
  "no-patch": "AI가 유효한 수정안을 만들지 못했어요.",
  disabled: "AI 수정 서비스가 꺼져 있어요.",
  "draft-rejected": "수정안이 검사를 통과하지 못했어요.",
  "draft-unavailable": "수정안 생성 서비스에 연결하지 못했어요.",
  "github-unavailable": "GitHub 수정 PR 생성에 실패했어요. 저장소의 브랜치·PR과 연결 권한을 확인해 주세요.",
  interrupted: "작업이 중단됐어요. 저장소의 PR을 확인하고 새 배포에서 다시 시도해 주세요.",
};

// 서버가 PR 주소를 확인하지만 화면에 링크를 걸기 전에 한 번 더 본다
const PR_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/;

export function FixProgress({ projectId }: { projectId?: string }) {
  const { t, locale } = useI18n();
  const { data, error, refresh } = useFixProgress(projectId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const format = useMemo(() => new Intl.DateTimeFormat(locale, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }), [locale]);
  if (!projectId) return null;
  const current = data?.runs.find((run) => run.status === "running") ?? data?.runs[0];
  async function consent(value: boolean) {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await projectRequest(`/api/projects/${projectId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remediate: value }),
      });
      refresh();
    } catch { setSaveError("AI 수정 설정을 저장하지 못했어요."); }
    finally { setSaving(false); }
  }
  const time = (at: string) => format.format(new Date(at));
  const reached = current ? fixStages.indexOf(current.stage) : -1;
  return (
    <section className="mt-8 w-full max-w-lg rounded-xl border border-line bg-field p-5 text-left" aria-label={t("AI 수정 진행")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-control font-semibold text-ink">{t("AI 수정 진행")}</h3>
        <p role="status" className="text-caption text-mute">{current ? t(statuses[current.status]) : t("요청 대기")}</p>
      </div>
      <p className="mt-2 text-caption text-mute">{t("장애가 감지되면 AI가 수정안을 만들고 PR로 전달해요. 변경 내용을 검토한 뒤 적용해 주세요.")}</p>
      {data && (
        <label className="mt-4 flex items-center gap-2 text-caption text-ink">
          <input type="checkbox" checked={data.consent} disabled={saving} onChange={(event) => void consent(event.target.checked)} />
          {t("AI 수정 PR 허용")}
        </label>
      )}
      {data && !data.enabled && <p className="mt-2 text-caption text-mute">{t("AI 수정 서비스가 꺼져 있어요.")}</p>}
      {data && !data.githubApp && (
        <a href="/api/github/install" className="mt-2 inline-block text-caption text-ink underline">{t("GitHub 연결")}</a>
      )}
      {(error || saveError) && <p role="alert" className="mt-3 text-caption text-danger">{t(saveError || error)}</p>}
      {current ? (
        <>
          <p className="mt-4 text-caption text-mute">
            {t("대상 커밋")} <code className="text-ink">{current.sourceCommit.slice(0, 7) || "—"}</code>
          </p>
          <ol className="mt-4 space-y-3">
            {fixStages.map((stage, index) => {
              const done = index < reached || current.status === "review";
              const active = index === reached && current.status === "running";
              const stopped = index === reached && ["skipped", "failed"].includes(current.status);
              return (
                <li key={stage} className={`flex items-center gap-3 text-caption ${active || done ? "text-ink" : "text-mute"}`} aria-current={active ? "step" : undefined}>
                  <span aria-hidden="true" className={active ? "motion-safe:animate-pulse" : ""}>{done ? "✓" : active ? "●" : stopped ? "!" : "○"}</span>
                  <span>{t(stages[stage])}</span>
                  {active && <span className="ml-auto text-mute">{t("진행 중")}</span>}
                  {stopped && <span className="ml-auto text-mute">{t(statuses[current.status])}</span>}
                </li>
              );
            })}
          </ol>
          {current.reasonCode && <p className="mt-4 text-caption text-mute">{t(reasons[current.reasonCode] ?? "수정 작업 실패")}</p>}
          {!!current.files.length && (
            <details className="mt-4 text-caption">
              <summary className="cursor-pointer text-ink">{t("변경 파일 보기")}</summary>
              <ul className="mt-2 space-y-1 text-mute">{current.files.map((path) => <li key={path} className="break-all font-mono">{path}</li>)}</ul>
            </details>
          )}
          {current.prUrl && PR_URL.test(current.prUrl) && (
            <a href={current.prUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-control text-ink underline">{t("GitHub에서 변경 내용·PR 보기")}</a>
          )}
          <details className="mt-5 border-t border-line pt-4 text-caption">
            <summary className="cursor-pointer text-mute">{t("최근 수정 이력")}</summary>
            <ul className="mt-3 space-y-4">
              {data?.runs.map((run) => (
                <li key={run.id}>
                  <p className="text-ink">{t(statuses[run.status])} · <code>{run.sourceCommit.slice(0, 7) || "—"}</code></p>
                  <ol className="mt-1 space-y-1 text-mute">{run.events.map((event, index) => <li key={`${event.stage}-${index}`}><time dateTime={event.at}>{time(event.at)}</time> · {t(stages[event.stage])}</li>)}</ol>
                  {run.reasonCode && <p className="mt-1 text-mute">{t(reasons[run.reasonCode] ?? "수정 작업 실패")}</p>}
                  {run.prUrl && PR_URL.test(run.prUrl) && (
                    <a href={run.prUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-ink underline">{t("GitHub에서 변경 내용·PR 보기")}</a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : <p className="mt-4 text-caption text-mute">{t(data ? "아직 AI 수정 요청이 없어요." : "AI 수정 상태를 확인하고 있어요.")}</p>}
    </section>
  );
}
