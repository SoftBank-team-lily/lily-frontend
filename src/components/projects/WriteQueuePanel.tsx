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
 * 온프레미스 앱의 엣지 쓰기 큐: PC 가 꺼진 동안 등록 경로의 POST 를 Cloudflare 에 쌓았다가 PC 가 돌아오면 순서대로 다시 보낸다.
 * 등록 경로와 최근 요청(경로·상태만, 본문은 보이지 않음)을 보인다
 */
export function WriteQueuePanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [draft, setDraft] = useState<string | null>(null);
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

  async function save(paths: string[]) {
    setBusy(true);
    setError(null);
    try {
      const value = await projectRequest<Loaded>(`/api/projects/${projectId}/write-queue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      setLoaded(value);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof ProjectError ? cause.message : "요청을 처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (loaded === undefined || (loaded && !loaded.available)) return null;

  const queue = loaded?.queue ?? null;
  const text = draft ?? (queue?.paths ?? []).join("\n");
  const paths = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const on = (queue?.paths.length ?? 0) > 0;

  return (
    <section aria-labelledby="write-queue-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="write-queue-title" className="text-lead font-semibold">
          {t("장애 중 쓰기 보관")}
        </h2>
        {queue && (
          <span
            className={`rounded-lg border px-2 py-0.5 text-caption ${on ? "border-onprem text-onprem" : "border-line text-mute"}`}
          >
            {on ? t("켜짐") : t("꺼짐")}
          </span>
        )}
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
      <p className="mt-2 text-caption text-mute">
        {t(
          "PC 가 꺼진 동안 아래 경로로 온 POST 를 Cloudflare 에 암호화해 쌓고 202 로 접수해요. PC 가 돌아오면 받은 순서대로 다시 보내요. 글·댓글처럼 쌓기만 하는 경로만 넣어 주세요. 결제·재고처럼 그 순간의 상태가 중요한 요청은 넣지 마세요.",
        )}
      </p>

      {!queue ? (
        <p className="mt-3 text-caption text-mute">{t("Cloudflare 에서 쓰기 큐 상태를 읽지 못했어요.")}</p>
      ) : (
        <>
          {queue.routed === false && (
            <p className="mt-3 text-caption text-warning">
              {t("이 앱 공개 주소에는 아직 엣지 Worker 가 없어요. 경로를 저장해도 요청이 큐를 거치지 않아요.")}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 text-control">
            <label htmlFor="write-queue-paths" className="text-caption text-mute">
              {t("POST 경로 (한 줄에 하나, 그 아래 경로도 포함)")}
            </label>
            <textarea
              id="write-queue-paths"
              rows={3}
              value={text}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={"/posts\n/comments"}
              spellCheck={false}
              className="min-w-0 rounded-xl border border-line bg-field px-4 py-3 font-mono text-caption text-ink outline-none placeholder:text-mute focus-visible:border-ink"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => save(paths)}
                disabled={busy || draft === null}
                className="rounded-md border border-line px-3 py-1 text-caption text-ink hover:bg-field disabled:text-mute"
              >
                {busy ? t("저장하는 중…") : t("경로 저장")}
              </button>
              {on && (
                <button
                  type="button"
                  onClick={() => save([])}
                  disabled={busy}
                  className="rounded-md border border-line px-3 py-1 text-caption text-ink hover:bg-field disabled:text-mute"
                >
                  {t("끄기")}
                </button>
              )}
            </div>
            {error && <p className="text-caption text-danger">{t(error)}</p>}
          </div>

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

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "–"
    : `${date.toLocaleDateString()} ${date.toTimeString().slice(0, 8)}`;
}
