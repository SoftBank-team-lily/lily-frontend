"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { ProjectSchema, SchemaEntry } from "@/lib/projects/types";

/** 롤백 창은 분 단위로 닫힌다. 남은 시간은 초마다 다시 그린다 */
const SCHEMA_MS = 15_000;

const stateTone: Record<SchemaEntry["state"], string> = {
  active: "border-cloud text-cloud",
  complete: "border-line text-ink",
  baseline: "border-line text-mute",
  applied: "border-line text-ink",
  failed: "border-danger text-danger",
};
const stateLabel: Record<SchemaEntry["state"], string> = {
  active: "롤백 창 열림",
  complete: "확정",
  baseline: "출발점",
  applied: "적용",
  failed: "실패",
};

/** 클라우드 앱의 스키마 이력: 현재 버전, pgroll 롤백 창(남은 시간·바로 확정), DB 이력 */
export function SchemaPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [schema, setSchema] = useState<ProjectSchema | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      projectRequest<{ schema: ProjectSchema | null }>(`/api/projects/${projectId}/schema`)
        .then((value) => alive && setSchema(value.schema))
        .catch(() => alive && setSchema((current) => current ?? null));
    void load();
    const timer = setInterval(load, SCHEMA_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectId]);

  const closesAt = schema?.window?.completeAfter ? Date.parse(schema.window.completeAfter) : null;
  useEffect(() => {
    if (closesAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [closesAt]);

  async function close() {
    if (!window.confirm(t("확정하면 이 마이그레이션 전으로 스키마를 되돌릴 수 없어요. 확정할까요?"))) return;
    setBusy(true);
    setError(null);
    try {
      const value = await projectRequest<{ schema: ProjectSchema | null }>(
        `/api/projects/${projectId}/schema/complete`,
        { method: "POST" },
      );
      setSchema(value.schema);
    } catch (cause) {
      setError(cause instanceof ProjectError ? cause.message : "요청을 처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (schema === undefined) return null;

  const history = [...(schema?.history ?? [])].reverse();
  const left = closesAt != null ? Math.max(0, closesAt - now) : null;

  return (
    <section aria-labelledby="schema-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="schema-title" className="text-lead font-semibold">
          {t("스키마 이력")}
        </h2>
        {schema?.engine && (
          <span className="rounded-lg border border-line px-2 py-0.5 text-caption text-mute">
            {schema.engine === "pgroll" ? t("pgroll · 무중단") : "Flyway"}
          </span>
        )}
        {schema?.currentVersion && (
          <span className="text-control text-ink">
            <span className="text-mute">{t("현재")} · </span>
            {schema.currentVersion}
          </span>
        )}
      </div>

      {!schema ? (
        <p className="mt-3 text-caption text-mute">
          {t("클라우드에 배포한 뒤에 스키마 이력이 보여요.")}
        </p>
      ) : (
        <>
          {schema.window && (
            <div className="mt-3 rounded-xl border-2 border-cloud p-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-control font-semibold text-cloud">
                  {t("롤백 창 열림")} · {schema.window.migration}
                </p>
                {left != null && (
                  <span className="text-control tabular-nums text-ink">
                    {t("{{value0}} 남음", { value0: clock(left) })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="ml-auto rounded-md border border-line px-3 py-1 text-caption text-ink hover:bg-field disabled:text-mute"
                >
                  {busy ? t("확정하는 중…") : t("지금 확정")}
                </button>
              </div>
              <p className="mt-2 text-caption text-mute">
                {t("이 안에서 롤백하면 스키마도 이전 버전으로 되돌리고, 그사이 쓴 행은 남아요. 창이 지나거나 다음 배포가 오면 확정돼요.")}
              </p>
              {error && <p className="mt-2 text-caption text-danger">{t(error)}</p>}
            </div>
          )}

          {schema.message && (
            <p className="mt-3 text-caption text-mute">{t(schema.message)}</p>
          )}

          {history.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-caption">
                <thead className="text-mute">
                  <tr>
                    <th className="py-1 pr-4 font-normal">{t("버전")}</th>
                    <th className="py-1 pr-4 font-normal">{t("상태")}</th>
                    <th className="py-1 font-normal">{t("적용 시각")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry, index) => (
                    <tr key={`${entry.version}-${index}`} className="border-t border-line">
                      <td className="py-2 pr-4 break-all text-ink">
                        {entry.version ?? "–"}
                        {entry.description && (
                          <span className="ml-2 text-mute">{entry.description}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-lg border px-2 py-0.5 ${stateTone[entry.state] ?? "border-line text-mute"}`}
                        >
                          {t(stateLabel[entry.state] ?? entry.state)}
                        </span>
                      </td>
                      <td className="py-2 tabular-nums text-ink">{when(entry.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function when(iso: string | null) {
  if (!iso) return "–";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "–"
    : `${date.toLocaleDateString()} ${date.toTimeString().slice(0, 8)}`;
}
