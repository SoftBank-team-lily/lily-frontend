"use client";

import { useI18n } from "@/lib/i18n/provider";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  fixProject,
  projectRequest,
  ProjectError,
} from "@/lib/projects/client";
import { FixPanel } from "./FixPanel";
import { MovePanel } from "./MovePanel";
import { CloudMovePanel } from "./CloudMovePanel";
import { MultiCloudPanel } from "./MultiCloudPanel";
import type { AppState, Project, DeploymentStatus } from "@/lib/projects/types";
import { STAGES } from "@/lib/deploy/stages";
import { placeBadge } from "@/lib/projects/burst";
import { PlaceBadgeView } from "./PlaceBadge";
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
  cancelled: "배포 취소됨",
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
  const { t } = useI18n();
  const lock = useRef(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = project.latestDeployment;
  const deploying =
    latest !== null &&
    (latest.status === "queued" || latest.status === "running");
  const canRedeploy = latest !== null && !deploying;
  const runtime = project.runtime;
  /** 삭제 확인 중. dropDatabase: 앱 DB 도 같이 지운다 */
  const [deleting, setDeleting] = useState<{ dropDatabase: boolean } | null>(
    null,
  );
  /** 내 PC 로 옮기기 창 */
  const [moving, setMoving] = useState(false);
  const movingNow = deploying && latest?.move === "onprem";
  // 멀티클라우드(AWS + GCP)는 내 PC 로 옮기지 않는다 (builder 가 내 PC 배포에서 거절한다)
  const canMove =
    project.target === "cloud" && latest?.status === "succeeded" && !deploying && project.cloudProvider !== "MULTI";
  /** 다른 클라우드로 옮기기 창 (AWS ↔ GCP) */
  const [cloudMoving, setCloudMoving] = useState(false);
  // 멀티클라우드(AWS + GCP)는 이미 두 클라우드에 떠 있어 옮기지 않는다
  const canCloudMove =
    latest?.status === "succeeded" && !deploying && project.deploymentMode !== "ONPREM_ONLY"
    && project.cloudProvider !== "MULTI";
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
  /** 진행 중인 배포를 멈춘다. 결과(cancelled)는 목록 새로고침으로 보인다 */
  const cancelDeploy = () =>
    act(async () => {
      if (!latest) return;
      onUpdate(
        await projectRequest<Project>(
          `/api/projects/${project.id}/deployments/${latest.id}/cancel`,
          { method: "POST" },
        ),
      );
    });
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
      setError(
        problem instanceof Error
          ? problem.message
          : "입력 내용을 확인해 주세요.",
      );
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
    <li className="rounded-xl border border-line p-5 transition-colors hover:border-ink">
      {/* 카드 윗부분을 누르면 그 프로젝트의 모니터링·거점·트래픽 화면으로 간다 */}
      <Link
        href={`/projects/${encodeURIComponent(project.id)}`}
        className="group -m-2 flex items-start justify-between gap-3 rounded-lg p-2 hover:bg-field"
        aria-label={t("{{value0}} 자세히 보기", { value0: project.name })}
      >
        <div className="min-w-0">
          <PlaceBadgeView
            badge={placeBadge(
              project,
              movingNow
                ? Math.min(99, Math.round(((step + 1) / STAGES.length) * 100))
                : null,
            )}
          />
          <h3 className="mt-2 break-words text-lead font-semibold group-hover:text-accent">
            {project.name}
          </h3>
          <p className="mt-1 break-all text-caption text-mute">
            {project.repo}
          </p>
        </div>
        <span
          className="mt-1 text-display leading-none text-mute group-hover:text-ink"
          aria-hidden="true"
        >
          ›
        </span>
      </Link>
      <p className="mt-3 text-caption text-mute">
        {movingNow
          ? t("클라우드 → 온프레미스 전환 중")
          : t("{{value0}} 배포", {
              value0: t(targetLabels[project.target]),
            })}{" "}
        · {project.deploymentMode === "ONPREM_ONLY" && (
          <>{t("온프레미스 전용")} · </>
        )}
        {project.deploymentMode !== "ONPREM_ONLY" && project.cloudSelection === "auto" && <p className="text-caption text-mute">{t("자동 선택")}: {project.cloudSelectionReason ?? project.cloudProvider}</p>}
        {project.deploymentMode !== "ONPREM_ONLY" && project.cloudProvider === "GCP" && (
          <>GCP · </>
        )}
        {project.cloudProvider === "MULTI" && <>AWS + GCP · </>}
        {project.movedFromCloud && <>{t("클라우드 주소 그대로 ·")} </>}
        {project.databaseLocation && (
          <>{t(locationLabels[project.databaseLocation])} · </>
        )}
        {project.latestDeployment
          ? t(statusLabels[project.latestDeployment.status])
          : t("배포 기록 없음")}
        {runtime &&
          (runtime.state !== "absent" || latest?.status === "succeeded") && (
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
                {t(runtimeLabels[runtime.state])}
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
            <span className="text-ink">{t(STAGES[step].name)}</span>
            <span className="text-mute">
              {step + 1}/{STAGES.length}
            </span>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-field"
            role="progressbar"
            aria-label={t("배포 진행")}
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
            <p
              className="mt-2 truncate font-mono text-caption text-mute"
              title={stepLine}
            >
              {stepLine}
            </p>
          )}
          <button
            type="button"
            onClick={cancelDeploy}
            disabled={busy}
            className="mt-2 text-caption text-mute hover:text-danger disabled:opacity-40"
          >
            {busy ? t("요청 중…") : t("배포 취소")}
          </button>
        </div>
      )}
      {latest?.autoFixed && (
        <p className="mt-1 text-caption text-mute">
          {t("실패 원인을 찾아 자동으로 고쳐 다시 배포했어요 (")}
          {latest.autoFixAttempt}
          {t("번째).")}
        </p>
      )}
      {project.unsetKeys.length > 0 && (
        <p className="mt-1 break-words text-caption text-mute">
          {t("값을 몰라 비워 둔 설정:")}{" "}
          <span className="font-mono text-ink">
            {project.unsetKeys.join(", ")}
          </span>
          {t(". 설정에서 넣으면 그 기능이 켜져요.")}
        </p>
      )}
      {latest?.status === "failed" && latest.diagnosis ? (
        <FixPanel
          diagnosis={latest.diagnosis}
          onApply={async (input) =>
            onUpdate(await fixProject(project.id, input, true))
          }
        />
      ) : (
        latest?.message &&
        (latest.status === "failed" ||
          latest.status === "rolled-back" ||
          latest.status === "cancelled") && (
          <p className="mt-1 break-words text-caption text-mute">
            {t(latest.message)}
          </p>
        )
      )}
      {latest && latest.logs.length > 0 && (
        <details className="mt-2 text-caption">
          <summary className="cursor-pointer text-mute hover:text-ink">
            {t("배포 로그")}
            {latest.stage ? ` (${latest.stage})` : ""}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-field p-3 font-mono text-caption whitespace-pre-wrap break-all text-mute">
            {latest.logs.join("\n")}
          </pre>
        </details>
      )}
      <WebhookSetup project={project} branch={project.branch || "main"} />
      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-3" aria-busy={busy}>
          <fieldset disabled={busy} className="flex flex-col gap-3">
            <AuthField
              id={`project-name-${project.id}`}
              name="name"
              label={t("프로젝트 이름")}
              defaultValue={project.name}
              required
              maxLength={100}
            />
            <p className="text-caption text-mute">
              {t("앱 폴더:")}
              {project.rootDir || t("레포 루트")}{" "}
              {t("(폴더를 바꾸려면 새로 등록해 주세요)")}
            </p>
            <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
              <AuthField
                id={`project-branch-${project.id}`}
                name="branch"
                label={t("브랜치")}
                defaultValue={project.branch ?? ""}
                maxLength={200}
                placeholder={t("기본 브랜치")}
              />
              <AuthField
                id={`project-port-${project.id}`}
                name="port"
                label={t("포트")}
                inputMode="numeric"
                defaultValue={project.port ?? ""}
                maxLength={5}
                placeholder={t("자동")}
              />
            </div>
            <AuthField
              id={`project-health-${project.id}`}
              name="healthPath"
              label={t("헬스 체크 경로")}
              defaultValue={project.healthPath ?? ""}
              maxLength={200}
              placeholder={t("비우면 포트가 열렸는지만 봐요")}
            />
            {project.envKeys.length > 0 && (
              <fieldset className="flex flex-col gap-2 text-control">
                <legend className="mb-2">
                  {t("저장된 환경변수 (값은 보이지 않아요)")}
                </legend>
                {project.envKeys.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 font-mono text-caption"
                  >
                    <input type="checkbox" name="removeEnv" value={key} />
                    {key} {t("지우기")}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-col gap-2 text-control">
              <label htmlFor={`project-env-${project.id}`}>
                {t("환경변수 추가·변경")}
              </label>
              <textarea
                id={`project-env-${project.id}`}
                name="env"
                rows={3}
                spellCheck={false}
                placeholder={t("KEY=VALUE (적은 키만 바뀌어요)")}
                className="min-w-0 rounded-xl border border-line bg-field px-4 py-3 font-mono text-caption text-ink outline-none placeholder:text-mute focus-visible:border-ink"
              />
            </div>
            <p className="text-caption text-mute">
              {t("바꾼 설정은 다음 배포부터 적용돼요.")}
            </p>
            <div className="flex flex-wrap gap-2">
              {canRedeploy && (
                <Button type="submit" value="deploy" disabled={busy}>
                  {busy ? t("저장 중…") : t("저장하고 다시 배포")}
                </Button>
              )}
              <Button type="submit" variant="ghost" disabled={busy}>
                {busy ? t("저장 중…") : t("저장")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                {t("취소")}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-caption">
          <button
            type="button"
            disabled={moving}
            onClick={() => {
              setEditing(true);
              setError("");
            }}
            className="text-mute hover:text-ink disabled:opacity-40"
          >
            {t("설정")}
          </button>
          {canRedeploy && (
            <button
              type="button"
              onClick={redeploy}
              disabled={busy || moving}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              {busy ? t("요청 중…") : t("다시 배포")}
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
                {t("중지")}
              </button>
            )}
          {runtime?.state === "stopped" && !deploying && (
            <button
              type="button"
              onClick={() => void setRunning(true)}
              disabled={busy}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              {t("다시 시작")}
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
              {t("클라우드 → 온프레미스 전환")}
            </button>
          )}
          {canCloudMove && !cloudMoving && (
            <button
              type="button"
              onClick={() => {
                setCloudMoving(true);
                setError("");
              }}
              disabled={busy}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              {t("다른 클라우드로 옮기기")}
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
              {t("삭제")}
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
                {t("앱 열기")}
              </a>
            )}
          {project.latestDeployment?.status === "succeeded" && (
            <Link
              href={`/?project=${project.id}`}
              className="text-ink underline"
            >
              {t("꽃으로 대시보드 열기")}
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
      {project.target === "cloud" && project.cloudProvider === "MULTI" && !editing && (
        <MultiCloudPanel project={project} />
      )}
      {cloudMoving && project.deploymentMode !== "ONPREM_ONLY" && !editing && (
        <CloudMovePanel
          project={project}
          deploying={deploying}
          onUpdate={onUpdate}
          onClose={() => setCloudMoving(false)}
        />
      )}
      {deleting && !editing && (
        <div className="mt-4 rounded-xl border border-danger p-4 text-caption">
          <p className="text-ink">
            {project.target === "cloud"
              ? t(
                  "클러스터에서 앱을 지우고 프로젝트와 배포 기록도 지워요. 잠깐 멈추려면 '중지'를 쓰세요.",
                )
              : t(
                  "내 PC 의 앱 컨테이너와 공개 주소, 클라우드 대기 Pod 를 지우고 프로젝트와 배포 기록도 지워요.",
                )}
          </p>
          {/* 내 PC 앱이 사용자가 준 DB(external)를 쓰면 그 DB 는 지우지 않으므로 묻지 않는다 */}
          {(project.target === "cloud" ||
            (project.database !== "none" && project.databaseLocation !== "external")) && (
            <label className="mt-3 flex items-center gap-2 text-mute">
              <input
                type="checkbox"
                checked={deleting.dropDatabase}
                onChange={(event) =>
                  setDeleting({ dropDatabase: event.target.checked })
                }
              />
              {t("앱 DB 도 같이 지우기 (데이터를 되돌릴 수 없어요)")}
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(deleting.dropDatabase)}
              className="h-10 rounded-xl bg-danger px-5 text-control font-semibold text-ink disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
            >
              {busy ? t("지우는 중…") : t("삭제")}
            </button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              {t("취소")}
            </Button>
          </div>
        </div>
      )}
      <p role="alert" className="mt-2 text-caption text-danger">
        {t(error)}
      </p>
    </li>
  );
}

function WebhookSetup({
  project,
  branch,
}: {
  project: Project;
  branch: string;
}) {
  if (project.githubApp)
    return (
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-caption text-mute">
          GitHub App이 연결되어 있어요. {branch}에 푸시하면 이 프로젝트를 다시
          배포해요.
        </p>
      </div>
    );
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-caption text-mute">
        <a href="/api/github/install" className="text-ink underline">
          GitHub 연결
        </a>
        을 누르면 저장소를 고르는 화면으로 이동해요. 연결한 뒤에는 아래 값을
        붙이지 않아도 {branch} 푸시가 배포돼요.
      </p>
      <p className="mt-2 text-caption text-mute">
        앱을 쓰기 전에는 GitHub 저장소의 Settings → Webhooks에 아래 값을
        넣으세요. Content type은 application/json, 이벤트는 push만 고르세요.
      </p>
      {project.webhookUrl ? (
        <CopyLine label="Payload URL" value={project.webhookUrl} />
      ) : (
        <p className="mt-2 text-caption text-danger">
          서버 주소가 없어 웹훅 주소를 만들지 못했어요.
        </p>
      )}
      <CopyLine label="Secret" value={project.webhookSecret ?? ""} />
      <p className="mt-2 text-caption text-mute">
        같은 저장소의 다른 폴더는 웹훅을 하나씩 더 추가해 주세요.
      </p>
    </div>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-mute">{label}</p>
        <button
          type="button"
          className="text-caption text-mute hover:text-ink"
          aria-label={done ? `${label} 복사됨` : `${label} 복사`}
          aria-live="polite"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
            } catch {
              setDone(false);
            }
          }}
        >
          {done ? "복사됨" : "복사"}
        </button>
      </div>
      <p className="mt-1 break-all font-mono text-caption text-ink">{value}</p>
    </div>
  );
}
