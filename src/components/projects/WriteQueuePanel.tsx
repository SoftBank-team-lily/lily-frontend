"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { WriteQueue, WriteQueueItem } from "@/lib/projects/types";

/** 장애 중에는 쌓이고, 복구되면 10~60초 간격으로 다시 보낸다 */
const QUEUE_MS = 5_000;

type Loaded = { available: boolean; queue: WriteQueue | null };

const stateTone: Record<WriteQueueItem["state"], string> = {
  queued: "border-warning text-warning",
  sent: "border-onprem text-onprem",
  failed: "border-danger text-danger",
};
const stateLabel: Record<WriteQueueItem["state"], string> = {
  queued: "대기",
  sent: "반영",
  failed: "거절",
};

/**
 * 온프레미스 앱의 PC 장애 대비: 읽기 사본(Cache API)과 쓰기 보관(DO) 체크박스, PC 상태, 최근 쌓인 요청(경로·상태만).
 * 쓰기 보관을 켜면 PC 가 꺼진 동안 그 앱의 POST 를 Cloudflare 에 암호화해 쌓았다가 PC 가 돌아오면 순서대로 다시 보낸다
 */
export function WriteQueuePanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      projectRequest<Loaded>(`/api/projects/${projectId}/write-queue`)
        .then((value) => alive && setLoaded(value))
        .catch(() => alive && setLoaded((current) => current ?? null));
    void load();
    const timer = setInterval(load, QUEUE_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectId]);

  async function save(change: { queue?: boolean; snapshot?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const value = await projectRequest<Loaded>(`/api/projects/${projectId}/write-queue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      setLoaded(value);
    } catch (cause) {
      setError(cause instanceof ProjectError ? cause.message : "요청을 처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (loaded === undefined || (loaded && !loaded.available)) return null;

  const queue = loaded?.queue ?? null;
  const writes = (queue?.paths.length ?? 0) > 0;
  const reads = queue?.snapshot !== false;

  return (
    <section aria-labelledby="write-queue-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="write-queue-title" className="text-lead font-semibold">
          {t("PC 장애 대비")}
        </h2>
        {queue && (
          <span className="text-control text-ink tabular-nums">
            <span className="text-mute">{t("대기")} · </span>
            {queue.counts.queued}
            <span className="ml-3 text-mute">{t("반영")} · </span>
            {queue.counts.sent}
            <span className="ml-3 text-mute">{t("거절")} · </span>
            {queue.counts.failed}
          </span>
        )}
      </div>

      {!queue ? (
        <p className="mt-3 text-caption text-mute">{t("Cloudflare 에서 쓰기 큐 상태를 읽지 못했어요.")}</p>
      ) : (
        <>
          {queue.routed === false && (
            <p className="mt-3 text-caption text-warning">
              {t("이 앱 공개 주소에는 아직 엣지 Worker 가 없어요. 설정을 바꿔도 요청이 Worker 를 거치지 않아요.")}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 text-control">
            <EdgeOption
              id="edge-snapshot"
              checked={reads}
              disabled={busy}
              label={t("장애 중 읽기 사본 (Cache API)")}
              description={t("PC 가 응답한 공개 페이지를 저장해 두었다가, PC 가 꺼지면 그 사본으로 보여 줘요.")}
              onChange={(value) => save({ snapshot: value })}
            />
            <EdgeOption
              id="edge-queue"
              checked={writes}
              disabled={busy}
              label={t("장애 중 쓰기 보관 (Durable Object)")}
              description={t("PC 가 꺼진 동안 온 POST 를 암호화해 쌓고 202 로 접수해요. PC 가 돌아오면 받은 순서대로 다시 보내요.")}
              onChange={(value) => save({ queue: value })}
            />
            {error && <p className="text-caption text-danger">{t(error)}</p>}
          </div>
          <dl className="mt-3 grid gap-1 text-caption sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-mute">{t("PC 상태")}</dt>
            <dd className={queue.downSince ? "text-warning" : "text-ink"}>
              {queue.downSince
                ? t("장애로 보고 새 POST 를 쌓는 중 · {{value0}}부터", { value0: when(queue.downSince) })
                : t("정상 (POST 를 PC 로 바로 보냄)")}
            </dd>
            <dt className="text-mute">{t("마지막 PC 확인")}</dt>
            <dd className="tabular-nums text-ink">
              {queue.lastCheck ? `${when(queue.lastCheck.at)} · ${t(checkLabel(queue.lastCheck), checkValues(queue.lastCheck))}` : t("아직 없음")}
            </dd>
          </dl>

          {queue.items.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-caption">
                <thead className="text-mute">
                  <tr>
                    <th className="py-1 pr-4 font-normal">{t("경로")}</th>
                    <th className="py-1 pr-4 font-normal">{t("상태")}</th>
                    <th className="py-1 pr-4 font-normal">{t("받은 시각")}</th>
                    <th className="py-1 font-normal">{t("처리 시각")}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.items.map((item) => (
                    <tr key={item.queuedId} className="border-t border-line">
                      <td className="py-2 pr-4 break-all font-mono text-ink">POST {item.path}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-lg border px-2 py-0.5 ${stateTone[item.state]}`}>
                          {t(stateLabel[item.state])}
                          {item.status != null && ` · ${item.status}`}
                        </span>
                        {item.state === "queued" && item.attempts > 0 && (
                          <span className="ml-2 text-mute">
                            {t("{{value0}}번 시도", { value0: item.attempts })}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-ink">{when(item.receivedAt)}</td>
                      <td className="py-2 tabular-nums text-ink">
                        {item.state === "queued" ? "–" : when(item.updatedAt)}
                      </td>
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

/** 배포 화면과 같은 장애 대비 체크박스 */
function EdgeOption({
  id,
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="text-ink">{label}</span>
        <span className="block text-caption text-mute">{description}</span>
      </span>
    </label>
  );
}

type Check = NonNullable<WriteQueue["lastCheck"]>;

/** 재전송 전 PC 확인 결과 문구. 5xx 면 기다리고, 앱 5xx 가 10번 이어지면 보내 본다 */
function checkLabel(check: Check) {
  if (check.status === null) return "응답 없음 (기다림)";
  if (check.edge) return "{{value0}} Cloudflare 오류 · PC 에 닿지 않음 (기다림)";
  if (check.status >= 500) return "{{value0}} 앱 오류 · {{value1}}번째 (10번이면 보내 봄)";
  return "{{value0}} 응답 · PC 에 닿음";
}

function checkValues(check: Check) {
  return { value0: check.status ?? "", value1: check.appErrors };
}

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "–"
    : `${date.toLocaleDateString()} ${date.toTimeString().slice(0, 8)}`;
}
