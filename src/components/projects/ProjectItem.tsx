"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { fixProject, projectRequest, ProjectError } from "@/lib/projects/client";
import { FixPanel } from "./FixPanel";
import { MovePanel } from "./MovePanel";
import { StatusOverview } from "./StatusOverview";
import { BurstPanel } from "./BurstPanel";
import type { AppState, Project, DeploymentStatus } from "@/lib/projects/types";
import { STAGES } from "@/lib/deploy/stages";
import { lastLine, stageIndex } from "@/lib/deploy/progress";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui/Button";
import { readUpdate } from "@/lib/projects/settingsForm";

const targetLabels = { cloud: "클라우드", onprem: "온프레미스" } as const;
const locationLabels = {
  local: "DB 내 PC",
  external: "DB 기존 서버",
  cloud: "DB 클라우드",
} as const;
const statusLabels: Record<DeploymentStatus, string> = {
  queued: "배포 대기",
  running: "배포 중",
  succeeded: "배포 완료",
  failed: "배포 실패",
  "rolled-back": "롤백 완료",
};
const runtimeLabels: Record<AppState, string> = {
  running: "실행 중",
  starting: "Pod 준비 중",
  stopped: "중지됨",
  absent: "클러스터에 없음",
};
export function ProjectItem({
  project,
  onUpdate,
  onDelete,
}: {
  project: Project;
  onUpdate: (value: Project) => void;
  onDelete: (id: string) => void;
}) {
  const lock = useRef(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = project.latestDeployment;
  const deploying =
    latest !== null && (latest.status === "queued" || latest.status === "running");
  const canRedeploy = latest !== null && !deploying;
  const runtime = project.runtime;
  /** 삭제 확인 중. dropDatabase: 앱 DB 도 같이 지운다 */
  const [deleting, setDeleting] = useState<{ dropDatabase: boolean } | null>(null);
  /** 내 PC 로 옮기기 창 */
  const [moving, setMoving] = useState(false);
  const movingNow = deploying && latest?.move === "onprem";
  const canMove = project.target === "cloud" && latest?.status === "succeeded" && !deploying;
  /** 중지·다시 시작·삭제. 실패하면 이유를 보인다 */
  async function act(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (error) {
      setError(
        error instanceof ProjectError
          ? error.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const setRunning = (running: boolean) =>
    act(async () =>
      onUpdate(
        await projectRequest<Project>(
          `/api/projects/${project.id}/${running ? "start" : "stop"}`,
          { method: "POST" },
        ),
      ),
    );
  const remove = (dropDatabase: boolean) =>
    act(async () => {
      await projectRequest(
        `/api/projects/${project.id}${dropDatabase ? "?database=true" : ""}`,
        { method: "DELETE" },
      );
      onDelete(project.id);
    });
  const step = deploying && latest ? stageIndex(latest.stage, latest.logs) : 0;
  const stepLine = deploying && latest ? lastLine(latest.logs) : null;
  /** 앱 주소로 들어가도 응답할 Pod 가 없다 */
  const down = runtime?.state === "stopped" || runtime?.state === "absent";
  async function redeploy() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await startDeployment();
    } catch (error) {
      setError(
        error instanceof ProjectError
          ? error.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  /** 새 배포 기록(queued)을 만들면 실행기가 다음 주기에 가져간다 */
  async function startDeployment() {
    await projectRequest(`/api/projects/${project.id}/deployments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: "{}",
    });
    onUpdate(await projectRequest<Project>(`/api/projects/${project.id}`));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const andDeploy = submitter?.getAttribute("value") === "deploy";
    let body;
    try {
      body = readUpdate(new FormData(event.currentTarget));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "입력 내용을 확인해 주세요.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await projectRequest<Project>(
        `/api/projects/${project.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      onUpdate(updated);
      setEditing(false);
      if (andDeploy && canRedeploy) await startDeployment();
    } catch (error) {
      setError(
        error instanceof ProjectError
          ? error.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <li className="rounded-xl border border-line p-5">
      <h3 className="break-words text-lead font-semibold">{project.name}</h3>
      <p className="mt-1 break-all text-caption text-mute">{project.repo}</p>
      <p className="mt-3 text-caption text-mute">
        {movingNow ? "내 PC 로 옮기는 중" : `${targetLabels[project.target]} 배포`} ·{" "}
        {project.burst?.live?.home === "CLOUD" && <>공개 주소 클라우드 · </>}
        {project.burst?.live?.home?.startsWith("MOVING") && <>공개 주소 옮기는 중 · </>}
        {project.movedFromCloud && <>클라우드 주소 그대로 · </>}
        {project.databaseLocation && <>{locationLabels[project.databaseLocation]} · </>}
        {project.latestDeployment
          ? statusLabels[project.latestDeployment.status]
          : "배포 기록 없음"}
        {runtime && (runtime.state !== "absent" || latest?.status === "succeeded") && (
          <>
            {" · "}
            <span
              className={
                runtime.state === "running"
                  ? "text-ink"
                  : runtime.state === "starting"
                    ? "text-warning"
                    : "text-mute"
              }
            >
              {runtimeLabels[runtime.state]}
              {runtime.state === "running" || runtime.state === "starting"
                ? ` ${runtime.ready}/${runtime.replicas}`
                : ""}
            </span>
          </>
        )}
      </p>
      {deploying && latest && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-caption">
            <span className="text-ink">{STAGES[step].name}</span>
            <span className="text-mute">
              {step + 1}/{STAGES.length}
            </span>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-field"
            role="progressbar"
            aria-label="배포 진행"
            aria-valuemin={1}
            aria-valuemax={STAGES.length}
            aria-valuenow={step + 1}
          >
            <div
              className="h-full bg-accent transition-[width] duration-500"
              style={{ width: `${((step + 1) / STAGES.length) * 100}%` }}
            />
          </div>
          {stepLine && (
            <p className="mt-2 truncate font-mono text-caption text-mute" title={stepLine}>
              {stepLine}
            </p>
          )}
        </div>
      )}
      {latest?.autoFixed && (
        <p className="mt-1 text-caption text-mute">
          실패 원인을 찾아 자동으로 고쳐 다시 배포했어요 ({latest.autoFixAttempt}번째).
        </p>
      )}
      {project.unsetKeys.length > 0 && (
        <p className="mt-1 break-words text-caption text-mute">
          값을 몰라 비워 둔 설정:{" "}
          <span className="font-mono text-ink">{project.unsetKeys.join(", ")}</span>. 설정에서 넣으면 그 기능이 켜져요.
        </p>
      )}
      {latest?.status === "failed" && latest.diagnosis ? (
        <FixPanel
          diagnosis={latest.diagnosis}
          onApply={async (input) => onUpdate(await fixProject(project.id, input, true))}
        />
      ) : (
        latest?.message &&
        (latest.status === "failed" || latest.status === "rolled-back") && (
          <p className="mt-1 break-words text-caption text-mute">
            {latest.message}
          </p>
        )
      )}
      {latest && latest.logs.length > 0 && (
        <details className="mt-2 text-caption">
          <summary className="cursor-pointer text-mute hover:text-ink">
            배포 로그{latest.stage ? ` (${latest.stage})` : ""}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-field p-3 font-mono text-caption whitespace-pre-wrap break-all text-mute">
            {latest.logs.join("\n")}
          </pre>
        </details>
      )}
      {project.burst && !editing && <StatusOverview project={project} onUpdate={onUpdate} />}
      {project.burst && !deploying && !editing && (
        <BurstPanel project={project} burst={project.burst} onUpdate={onUpdate} />
      )}
      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-3" aria-busy={busy}>
          <fieldset disabled={busy} className="flex flex-col gap-3">
            <AuthField
              id={`project-name-${project.id}`}
              name="name"
              label="프로젝트 이름"
              defaultValue={project.name}
              required
              maxLength={100}
            />
            <p className="text-caption text-mute">
              앱 폴더: {project.rootDir || "레포 루트"} (폴더를 바꾸려면 새로
              등록해 주세요)
            </p>
            <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
              <AuthField
                id={`project-branch-${project.id}`}
                name="branch"
                label="브랜치"
                defaultValue={project.branch ?? ""}
                maxLength={200}
                placeholder="기본 브랜치"
              />
              <AuthField
                id={`project-port-${project.id}`}
                name="port"
                label="포트"
                inputMode="numeric"
                defaultValue={project.port ?? ""}
                maxLength={5}
                placeholder="자동"
              />
            </div>
            <AuthField
              id={`project-health-${project.id}`}
              name="healthPath"
              label="헬스 체크 경로"
              defaultValue={project.healthPath ?? ""}
              maxLength={200}
              placeholder="비우면 포트가 열렸는지만 봐요"
            />
            {project.envKeys.length > 0 && (
              <fieldset className="flex flex-col gap-2 text-control">
                <legend className="mb-2">저장된 환경변수 (값은 보이지 않아요)</legend>
                {project.envKeys.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 font-mono text-caption"
                  >
                    <input type="checkbox" name="removeEnv" value={key} />
                    {key} 지우기
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-col gap-2 text-control">
              <label htmlFor={`project-env-${project.id}`}>
                환경변수 추가·변경
              </label>
              <textarea
                id={`project-env-${project.id}`}
                name="env"
                rows={3}
                spellCheck={false}
                placeholder="KEY=VALUE (적은 키만 바뀌어요)"
                className="min-w-0 rounded-xl border border-line bg-field px-4 py-3 font-mono text-caption text-ink outline-none placeholder:text-mute focus-visible:border-ink"
              />
            </div>
            <p className="text-caption text-mute">
              바꾼 설정은 다음 배포부터 적용돼요.
            </p>
            <div className="flex flex-wrap gap-2">
              {canRedeploy && (
                <Button type="submit" value="deploy" disabled={busy}>
                  {busy ? "저장 중…" : "저장하고 다시 배포"}
                </Button>
              )}
              <Button type="submit" variant="ghost" disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                취소
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-caption">
          <a className="text-mute hover:text-ink" href={`/dashboard?project=${encodeURIComponent(project.id)}`}>대시보드로 이동</a>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setError("");
            }}
            className="text-mute hover:text-ink"
          >
            설정
          </button>
          {canRedeploy && (
            <button
              type="button"
              onClick={redeploy}
              disabled={busy}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              {busy ? "요청 중…" : "다시 배포"}
            </button>
          )}
          {runtime &&
            (runtime.state === "running" || runtime.state === "starting") &&
            !deploying && (
              <button
                type="button"
                onClick={() => void setRunning(false)}
                disabled={busy}
                className="text-mute hover:text-ink disabled:opacity-40"
              >
                중지
              </button>
            )}
          {runtime?.state === "stopped" && !deploying && (
            <button
              type="button"
              onClick={() => void setRunning(true)}
              disabled={busy}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              다시 시작
            </button>
          )}
          {canMove && !moving && (
            <button
              type="button"
              onClick={() => {
                setMoving(true);
                setError("");
              }}
              disabled={busy}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              내 PC 로 옮기기
            </button>
          )}
          {!deploying && (
            <button
              type="button"
              onClick={() => {
                setDeleting({ dropDatabase: false });
                setError("");
              }}
              disabled={busy}
              className="text-mute hover:text-danger disabled:opacity-40"
            >
              삭제
            </button>
          )}
          {project.latestDeployment?.status === "succeeded" &&
            !down &&
            project.latestDeployment.url && (
              <a
                href={project.latestDeployment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline"
              >
                앱 열기
              </a>
            )}
          {project.latestDeployment?.status === "succeeded" && (
            <Link
              href={`/?project=${project.id}`}
              className="text-ink underline"
            >
              꽃으로 대시보드 열기
            </Link>
          )}
        </div>
      )}
      {moving && canMove && !editing && (
        <MovePanel
          project={project}
          onMoved={(value) => {
            setMoving(false);
            onUpdate(value);
          }}
          onCancel={() => setMoving(false)}
        />
      )}
      {deleting && !editing && (
        <div className="mt-4 rounded-xl border border-danger p-4 text-caption">
          <p className="text-ink">
            {project.target === "cloud"
              ? "클러스터에서 앱을 지우고 프로젝트와 배포 기록도 지워요. 잠깐 멈추려면 '중지'를 쓰세요."
              : "프로젝트와 배포 기록을 지워요. 내 PC 에서 도는 앱은 에이전트를 멈추면 내려가요."}
          </p>
          {project.target === "cloud" && (
            <label className="mt-3 flex items-center gap-2 text-mute">
              <input
                type="checkbox"
                checked={deleting.dropDatabase}
                onChange={(event) =>
                  setDeleting({ dropDatabase: event.target.checked })
                }
              />
              앱 DB 도 같이 지우기 (데이터를 되돌릴 수 없어요)
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(deleting.dropDatabase)}
              className="h-10 rounded-xl bg-danger px-5 text-control font-semibold text-ink disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
            >
              {busy ? "지우는 중…" : "삭제"}
            </button>
            <Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>
              취소
            </Button>
          </div>
        </div>
      )}
      <p role="alert" className="mt-2 text-caption text-danger">
        {error}
      </p>
    </li>
  );
}
