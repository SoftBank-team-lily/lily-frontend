"use client";

import { useEffect, useRef, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import { burstBlocker, burstSummary, homeLabels } from "@/lib/projects/burst";
import type { Project, ProjectBurst } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";

/** 슬라이더를 멈추고 이만큼 지나면 보낸다. 끄는 중간 값마다 보내지 않는다 */
const COMMIT_MS = 500;

/**
 * 온프레미스 앱의 클라우드 버스팅과 거점.
 * 켜면 클라우드에 대기 Pod 1대를 두고, 슬라이더 비율만큼 요청을 클라우드로 보낸다 (0% 면 넘칠 때만).
 * 거점 전환은 공개 주소(CNAME) 자체를 클라우드로 옮긴다. 내 PC 가 꺼져도 주소가 산다.
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
  const [error, setError] = useState("");
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

  async function send(operation: () => Promise<Project>) {
    setBusy(true);
    setError("");
    try {
      onUpdate(await operation());
    } catch (problem) {
      setError(problem instanceof ProjectError ? problem.message : "서버에 연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  const save = (enabled: boolean, cloudPercent: number) =>
    send(() =>
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
  const move = (target: "cloud" | "onprem") =>
    send(() =>
      projectRequest<Project>(`/api/projects/${project.id}/home`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: target }),
      }),
    ).then(() => setConfirmHome(null));

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
          disabled={busy || !usable}
          onClick={() => void save(!burst.enabled, burst.cloudPercent)}
        >
          {burst.enabled ? "끄기" : "켜기"}
        </Button>
      </div>
      {blocker && <p className="mt-2 text-mute">{blocker}</p>}
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
            disabled={busy || !usable || !ready}
            onChange={(event) => slide(Number(event.target.value))}
            aria-valuetext={`클라우드 ${draft}%`}
            className="mt-2 w-full accent-accent disabled:opacity-40"
          />
          <p className="mt-1 text-mute">
            {ready
              ? "0% 여도 대기 Pod 1대는 켜 두고, 내 PC 가 넘치면 클라우드가 받아요."
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
                disabled={busy}
                onClick={() => setConfirmHome(home === "ONPREM" ? "cloud" : "onprem")}
                className="text-mute hover:text-ink disabled:opacity-40"
              >
                {home === "ONPREM" ? "클라우드로 옮기기" : "내 PC 로 되돌리기"}
              </button>
            )}
          </div>
          {live?.homeEvent && <p className="mt-1 break-words text-mute">최근: {live.homeEvent}</p>}
          {confirmHome && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="text-ink">
                {confirmHome === "cloud"
                  ? "공개 주소가 클라우드를 가리키게 해요. 클라우드가 준비된 걸 확인한 뒤 옮기고, 실패하면 내 PC 로 되돌려요. 30초 뒤 내 PC 앱은 멈춰요."
                  : "내 PC 에 앱을 다시 띄우고 공개 주소를 내 PC 로 되돌려요. 실패하면 클라우드에 남아요."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="h-10" disabled={busy} onClick={() => void move(confirmHome)}>
                  {busy ? "요청 중…" : "옮기기"}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmHome(null)}>
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <p role="alert" className="mt-2 text-danger">
        {error}
      </p>
    </section>
  );
}
