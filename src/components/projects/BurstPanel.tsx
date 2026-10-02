"use client";

import { useEffect, useRef, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import {
  activities,
  burstBlocker,
  burstLock,
  burstSummary,
  databaseMoveOffer,
  homeLabels,
  homeLock,
} from "@/lib/projects/burst";
import type { Project, ProjectBurst } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";
import { ActivityProgress } from "./ActivityProgress";

/** 슬라이더를 멈추고 이만큼 지나면 보낸다. 끄는 중간 값마다 보내지 않는다 */
const COMMIT_MS = 500;

/**
 * 온프레미스 앱의 클라우드 버스팅과 거점.
 * 켜면 클라우드에 대기 Pod 1대를 두고, 슬라이더 비율만큼 요청을 클라우드로 보낸다 (0% 면 넘칠 때만).
 * 거점 전환은 공개 주소(CNAME) 자체를 클라우드로 옮긴다. 내 PC 가 꺼져도 주소가 산다.
 * DB 가 출발 쪽(클라우드로 갈 때 내 PC, 돌아올 때 RDS)에 있으면 DB 도 옮길지 고르게 한다.
 * 둘 다 클라우드 대기 배포를 하므로 한쪽이 진행 중이면 다른 쪽을 막고, 진행 단계·경과 시간과 취소를 보인다.
 */
export function BurstPanel({
  project,
  burst,
  onUpdate,
}: {
  project: Project;
  burst: ProjectBurst;
  onUpdate: (value: Project) => void;
}) {
  const [draft, setDraft] = useState(burst.cloudPercent);
  const [busy, setBusy] = useState(false);
  /** 마지막으로 실패한 동작. offline: 에이전트가 끊겨서 실패했다, seen: 실패할 때 보고 있던 상태 */
  const [error, setError] = useState<{
    action: string;
    at: string;
    text: string;
    offline: boolean;
    seen: ProjectBurst;
  } | null>(null);
  // 끊김 때문에 실패했는데 그 뒤 새 상태가 왔고 에이전트가 붙어 있으면, 그 오류는 더 이상 맞지 않아 숨긴다
  const shownError =
    error && !(error.offline && error.seen !== burst && burst.agent === "connected") ? error : null;
  const [confirmHome, setConfirmHome] = useState<"cloud" | "onprem" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    // 다른 탭이나 에이전트가 바꾼 값을 따라간다 (끄는 중이면 그대로)
    if (!dragging.current) setDraft(burst.cloudPercent);
  }, [burst.cloudPercent]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const live = burst.live;
  const blocker = burstBlocker(burst);
  const usable = burst.agent === "connected" && !blocker;
  const summary = burstSummary(burst);
  const ready = Boolean(live?.enabled && live.warm && live.home === "ONPREM");
  const home = live?.home ?? null;
  const moving = home === "MOVING_TO_CLOUD" || home === "MOVING_TO_ONPREM";
  const running = activities(burst);
  /** 버스팅을 지금 못 바꾸는 이유 (거점 전환 중) */
  const locked = burstLock(burst);
  /** 거점을 지금 못 옮기는 이유 (버스팅 대기 배포 중) */
  const homeLocked = homeLock(burst);

  async function send(action: string, operation: () => Promise<Project>) {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await operation());
    } catch (problem) {
      setError({
        action,
        at: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
        text: problem instanceof ProjectError ? problem.message : "서버에 연결하지 못했어요.",
        offline: problem instanceof ProjectError && problem.code === "AGENT_OFFLINE",
        seen: burst,
      });
    } finally {
      setBusy(false);
    }
  }
  const save = (enabled: boolean, cloudPercent: number, action?: string) =>
    send(action ?? (enabled === burst.enabled ? "비율 바꾸기" : enabled ? "버스팅 켜기" : "버스팅 끄기"), () =>
      projectRequest<Project>(`/api/projects/${project.id}/burst`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, cloudPercent }),
      }),
    );
  function slide(value: number) {
    dragging.current = true;
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dragging.current = false;
      if (value !== burst.cloudPercent) void save(true, value);
    }, COMMIT_MS);
  }
  const move = (target: "cloud" | "onprem", migrateDatabase: boolean) =>
    send(target === "cloud" ? "온프레미스 → 클라우드 전환" : "클라우드 → 온프레미스 전환", () =>
      projectRequest<Project>(`/api/projects/${project.id}/home`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: target, migrateDatabase }),
      }),
    ).then(() => setConfirmHome(null));
  const offer = confirmHome ? databaseMoveOffer(live, confirmHome) : false;
  const cancelHome = () =>
    send("전환 취소", () =>
      projectRequest<Project>(`/api/projects/${project.id}/home/cancel`, { method: "POST" }),
    );

  return (
    <section className="mt-4 rounded-xl border border-line p-4 text-caption" aria-label="클라우드 버스팅">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-control font-semibold text-ink">클라우드 버스팅 · {summary.title}</p>
          {summary.detail && <p className="mt-1 text-mute">{summary.detail}</p>}
        </div>
        <Button
          variant={burst.enabled ? "ghost" : "primary"}
          className="h-10"
          // 공개 주소가 클라우드면 켤 수 없다 (끄기는 된다)
          disabled={busy || !usable || Boolean(locked) || (!burst.enabled && live?.home === "CLOUD")}
          title={locked ?? undefined}
          onClick={() => void save(!burst.enabled, burst.cloudPercent)}
        >
          {burst.enabled ? "끄기" : "켜기"}
        </Button>
      </div>
      {blocker && <p className="mt-2 text-mute">{blocker}</p>}
      {running.map((activity) => (
        <ActivityProgress
          key={activity.kind}
          activity={activity}
          busy={busy}
          onCancel={() => void (activity.kind === "home" ? cancelHome() : save(false, burst.cloudPercent, "대기 배포 취소"))}
        />
      ))}
      {running.length > 1 && (
        <p className="mt-2 text-warning">
          두 작업이 같이 돌고 있어요. 늦게 끝난 쪽이 클라우드 Pod 를 내릴 수 있으니 하나를 취소해 주세요.
        </p>
      )}
      {locked && <p className="mt-2 text-mute">{locked}</p>}
      {burst.enabled && (
        <div className="mt-4">
          <label htmlFor={`burst-${project.id}`} className="flex items-center justify-between gap-3 text-ink">
            <span>내 PC {100 - draft}%</span>
            <span>클라우드 {draft}%</span>
          </label>
          <input
            id={`burst-${project.id}`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft}
            disabled={busy || !usable || !ready || Boolean(locked)}
            onChange={(event) => slide(Number(event.target.value))}
            aria-valuetext={`클라우드 ${draft}%`}
            className="mt-2 w-full accent-accent disabled:opacity-40"
          />
          <p className="mt-1 text-mute">
            {ready
              ? "0% 여도 대기 Pod 1대는 켜 두고, 내 PC 가 넘치면 클라우드가 받아요."
              : !live
                ? "에이전트 상태를 확인하는 중이에요."
                : live.home !== "ONPREM"
                  ? "공개 주소가 클라우드라 버스팅을 쓰지 않아요. 클라우드 → 온프레미스 전환 뒤에 쓸 수 있어요."
                  : !live.enabled
                    ? "버스팅을 켜면 비율을 정할 수 있어요."
                    : "대기 Pod 가 준비되면 비율을 정할 수 있어요."}
          </p>
          {live && live.enabled && (
            <p className="mt-1 text-mute">
              처리 중 요청 · 내 PC {live.localActive} · 클라우드 {live.remoteActive} · 지금까지 클라우드로 {live.overflowedTotal}건
            </p>
          )}
        </div>
      )}
      {home && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink">
              공개 주소 거점 · <span className={moving ? "text-warning" : "text-ink"}>{homeLabels[home]}</span>
            </p>
            {live?.movable && !moving && (home === "ONPREM" || home === "CLOUD") && (
              <button
                type="button"
                disabled={busy || Boolean(homeLocked)}
                title={homeLocked ?? undefined}
                onClick={() => setConfirmHome(home === "ONPREM" ? "cloud" : "onprem")}
                className="text-mute hover:text-ink disabled:opacity-40"
              >
                {home === "ONPREM" ? "온프레미스 → 클라우드 전환" : "클라우드 → 온프레미스 전환"}
              </button>
            )}
          </div>
          {homeLocked && !moving && <p className="mt-1 text-mute">{homeLocked}</p>}
          {live?.databaseMode === "local" || live?.databaseMode === "cloud" ? (
            <p className="mt-1 text-mute">DB · {live.databaseMode === "local" ? "내 PC" : "클라우드(RDS)"}</p>
          ) : null}
          {live?.homeEvent && <p className="mt-1 break-words text-mute">최근: {live.homeEvent}</p>}
          {confirmHome && !offer && !homeLocked && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="text-ink">
                {confirmHome === "cloud"
                  ? "공개 주소가 클라우드를 가리키게 해요. 클라우드가 준비된 걸 확인한 뒤 전환하고, 실패하면 온프레미스로 되돌려요. 30초 뒤 내 PC 앱은 멈춰요."
                  : "내 PC 에 앱을 다시 띄우고 공개 주소를 온프레미스로 전환해요. 실패하면 클라우드에 남아요."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="h-10" disabled={busy} onClick={() => void move(confirmHome, false)}>
                  {busy ? "요청 중…" : "전환"}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmHome(null)}>
                  취소
                </Button>
              </div>
            </div>
          )}
          {confirmHome && offer && !homeLocked && (
            <div className="mt-3 rounded-xl border border-line p-3" role="group" aria-label="DB 도 옮길까요">
              <p className="text-ink">
                {confirmHome === "cloud"
                  ? "이 앱의 DB 는 지금 내 PC 에 있어요. DB 가 PC 에 남으면 PC 를 끌 때 앱도 멈춰요."
                  : "이 앱의 DB 는 지금 클라우드(RDS)에 있어요."}
              </p>
              <div className="mt-3 grid gap-2">
                <Button className="h-auto min-h-10 py-2 text-left" disabled={busy} onClick={() => void move(confirmHome, true)}>
                  {confirmHome === "cloud" ? "DB 를 클라우드(RDS)로 옮기고 전환" : "DB 를 내 PC 로 다시 옮기고 전환"}
                </Button>
                <p className="px-1 text-mute">
                  {confirmHome === "cloud"
                    ? "PC 를 꺼도 앱과 데이터가 살아 있어요. 전환하는 동안 잠깐 앱이 응답하지 않아요."
                    : "클라우드에 있는 동안 바뀐 데이터·스키마를 내 PC DB 에 덮어써요. 전환하는 동안 잠깐 앱이 응답하지 않아요."}
                </p>
                <Button variant="ghost" className="h-auto min-h-10 py-2 text-left" disabled={busy} onClick={() => void move(confirmHome, false)}>
                  {confirmHome === "cloud" ? "DB 는 내 PC 에 두고 전환" : "DB 는 RDS 에 두고 전환"}
                </Button>
                <p className="px-1 text-mute">
                  {confirmHome === "cloud"
                    ? "PC 의 DB 를 터널로 써요. PC 가 꺼지면 앱도 멈춰요."
                    : "내 PC 앱이 터널로 RDS 를 써요."}
                </p>
                <Button variant="ghost" className="h-10" disabled={busy} onClick={() => setConfirmHome(null)}>
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <p role="alert" className="mt-2 text-danger">
        {shownError && `${shownError.action} 실패 (${shownError.at}) · ${shownError.text}`}
      </p>
    </section>
  );
}
