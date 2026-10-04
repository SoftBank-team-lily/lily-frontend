"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useRef, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { CloudMove, CloudProvider, Project } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";

const MOVE_MS = 4_000;

const STEPS: Record<string, string> = {
  PREPARE: "새 클라우드용 이미지 만들기",
  DATABASE: "새 클라우드 DB 만들기",
  FREEZE: "원본 내리기",
  COPY: "DB 복사",
  DEPLOY: "새 클라우드에 배포",
  SWITCH: "공개 주소 전환",
};
/** DB 를 클라우드(RDS 터널)에 둔 내 PC 앱: 내 PC 앱 쓰기를 멈추고 DB 를 옮긴 뒤 내 PC 로 다시 배포한다 */
const HYBRID_STEPS: Record<string, string> = {
  DATABASE: "새 클라우드 DB 만들기",
  PAUSE: "내 PC 앱 쓰기 멈춤",
  COPY: "DB 복사",
  SWITCH: "클라우드 바꾸기",
  DEPLOY: "내 PC 로 다시 배포 (새 DB 로 연결)",
  STANDBY: "옛 클라우드 대기 Pod 정리",
};

/**
 * 클라우드 전용 앱을 다른 클라우드로 옮긴다 (AWS ↔ GCP). 진행은 lily-builder 가 하고 여기서는 몇 초마다 본다.
 * 끝나면 원본은 내려 둔 채 보관(HOLD)하고, 사용자가 되돌리거나 원본을 정리한다.
 */
export function CloudMovePanel({
  project,
  deploying,
  onUpdate,
  onClose,
}: {
  project: Project;
  /** 배포가 진행 중이면 옮기기를 시작하지 않는다 (서버도 막는다) */
  deploying: boolean;
  onUpdate: (value: Project) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [move, setMove] = useState<CloudMove | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const target: CloudProvider = project.cloudProvider === "GCP" ? "AWS" : "GCP";
  const hasDatabase = project.database === "postgres" || project.database === "mysql";
  const hybrid = project.target === "onprem";
  /** 내 PC 앱이 클라우드 DB 를 터널로 쓴다. DB 째 옮기고 그동안 앱이 응답하지 않는다 */
  const hybridDatabase = hybrid && project.databaseLocation === "cloud" && hasDatabase;

  // 창이 열려 있는 동안 몇 초마다 본다. 옮기기가 끝나면 프로젝트(클라우드 표시)를 다시 받는다
  const previous = useRef<CloudMove["state"] | null>(null);
  // 부모가 다시 그릴 때마다 조회를 다시 시작하지 않게 최신 콜백만 ref 로 본다
  const update = useRef(onUpdate);
  useEffect(() => {
    update.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      projectRequest<{ move: CloudMove | null }>(`/api/projects/${project.id}/cloud-move`)
        .then(async (value) => {
          if (!alive) return;
          setMove(value.move);
          const finished = previous.current === "RUNNING" && value.move?.state !== "RUNNING";
          previous.current = value.move?.state ?? null;
          if (finished) update.current(await projectRequest<Project>(`/api/projects/${project.id}`));
        })
        .catch(() => alive && setMove((current) => current ?? null));
    void load();
    const timer = setInterval(load, MOVE_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project.id]);

  async function send(body: object) {
    setBusy(true);
    setError("");
    try {
      const result = await projectRequest<{ move: CloudMove; project: Project }>(
        `/api/projects/${project.id}/cloud-move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setMove(result.move);
      previous.current = result.move.state;
      onUpdate(result.project);
    } catch (error) {
      setError(error instanceof ProjectError ? error.message : "서버에 연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const running = move?.state === "RUNNING";
  const holding = move?.state === "HOLD";
  const canStart = move !== undefined && !running && !holding;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-line p-4 text-caption">
      <div>
        <p className="text-control font-semibold text-ink">
          {t("다른 클라우드로 옮기기")}
        </p>
        <p className="mt-1 text-mute">
          {t(
            "공개 주소는 그대로예요. 새 클라우드에 띄우고 주소로 닿는 걸 확인한 뒤에 주소를 바꿔요. 중간에 실패하면 원본으로 되돌려요.",
          )}
        </p>
      </div>

      {move === undefined && <p className="text-mute">{t("상태를 확인하는 중…")}</p>}

      {running && move.step === "ROLLBACK" && (
        <p className="text-ink" aria-live="polite">
          {t("{{from}} 로 되돌리는 중이에요. 주소가 바뀐 뒤 반영을 기다렸다가 {{to}} 쪽을 지워요.", {
            from: move.from,
            to: move.to,
          })}
        </p>
      )}
      {running && move.step !== "ROLLBACK" && (
        <ol className="space-y-1" aria-live="polite">
          {Object.entries(move.hybrid ? HYBRID_STEPS : STEPS)
            .filter(([key]) => move.hybrid || hasDatabase || (key !== "DATABASE" && key !== "COPY"))
            .map(([key, label]) => (
              <li key={key} className={move.step === key ? "font-semibold text-ink" : "text-mute"}>
                {move.step === key ? "→ " : ""}
                {t(label)}
              </li>
            ))}
        </ol>
      )}

      {holding && (
        <div className="space-y-3">
          <p className="text-ink">
            {move.hybrid
              ? t("{{to}} 로 옮겼어요. 내 PC 앱은 이제 {{to}} DB 를 써요. {{from}} DB 는 보관 중이에요.", {
                  to: move.to,
                  from: move.from,
                })
              : t("{{to}} 로 옮겼어요. {{from}} 앱은 내려 두고 DB 와 함께 보관 중이에요.", {
                  to: move.to,
                  from: move.from,
                })}
            {move.downtimeMs != null &&
              ` ${t("멈춘 시간 약 {{seconds}}초", { seconds: Math.round(move.downtimeMs / 1000) })}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void send({ action: "finalize" })}>
              {t("{{from}} 정리 (되돌릴 수 없어요)", { from: move.from })}
            </Button>
          </div>
          {!move.hybrid && (
          <>
          <label className="flex items-center gap-2 text-mute">
            <input
              type="checkbox"
              checked={discard}
              disabled={busy}
              onChange={(event) => setDiscard(event.target.checked)}
            />
            {t("되돌리면 옮긴 뒤 {{to}} 에 쓴 데이터는 버려져요", { to: move.to })}
          </label>
          <Button
            variant="ghost"
            disabled={busy || !discard}
            onClick={() => void send({ action: "rollback", discardTargetWrites: true })}
          >
            {t("{{from}} 로 되돌리기", { from: move.from })}
          </Button>
          </>
          )}
          {move.hybrid && (
            <p className="text-mute">
              {t("내 PC 앱은 옮긴 뒤 새 DB 에 바로 써서 되돌리지 않아요. 돌아가려면 정리한 뒤 반대로 다시 옮겨요.")}
            </p>
          )}
        </div>
      )}

      {move?.state === "FAILED" && (
        <p className="text-danger">
          {t("지난 옮기기가 실패해서 원본으로 되돌렸어요.")} {move.message ?? ""}
        </p>
      )}
      {move?.state === "FINALIZED" && !move.hybrid && (
        <p className="text-mute">{t("{{to}} 로 옮기고 {{from}} 정리까지 끝났어요.", { to: move.to, from: move.from })}</p>
      )}
      {move?.state === "FINALIZED" && move.hybrid && (
        <p className="text-mute">
          {t("클라우드를 {{to}} 로 바꿨어요. 내 PC 로 다시 배포하면서 {{to}} 에 대기 Pod 를 만들어요.", { to: move.to })}
        </p>
      )}

      {canStart && (
        <div className="space-y-2">
          <p className="text-mute">
            {hybridDatabase
              ? t(
                  "DB 가 {{from}} 에 있어서 DB 째 옮겨요. 내 PC 앱 쓰기를 멈추고 DB 를 복사한 뒤, 내 PC 로 다시 배포해 {{to}} DB 에 붙여요. 그동안(1~2분) 앱이 응답하지 않아요. PostgreSQL 만 옮겨요.",
                  { from: project.cloudProvider, to: target },
                )
              : hybrid
              ? t(
                  "앱은 계속 내 PC 가 받아요. {{from}} 대기 Pod 를 지우고 내 PC 로 다시 배포해 {{to}} 에 대기 Pod 를 만들어요. 그동안 몇 분은 넘침과 PC 장애 때 클라우드 전환이 없어요. DB 를 클라우드(RDS 터널)에 둔 앱은 아직 옮기지 못해요.",
                  { from: project.cloudProvider, to: target },
                )
              : hasDatabase
              ? t(
                  "DB 가 있어서 쓰기가 갈라지지 않게 원본을 먼저 내리고 DB 를 복사해요. 복사와 새 배포 동안 앱이 응답하지 않아요. PostgreSQL 만 옮겨요.",
                )
              : t("DB 가 없어서 새 클라우드를 먼저 띄우고 주소를 바꿔요. 멈추는 시간이 없어요.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || deploying} onClick={() => void send({ action: "start", to: target })}>
              {busy
                ? t("요청 중…")
                : t("{{from}} → {{to}} 옮기기 시작", { from: project.cloudProvider, to: target })}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {t("닫기")}
            </Button>
          </div>
        </div>
      )}
      {(running || holding) && (
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          {t("닫기")}
        </Button>
      )}
      <p role="alert" className="text-danger">
        {t(error)}
      </p>
    </div>
  );
}
