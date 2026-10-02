"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { Project, DeploymentStatus } from "@/lib/projects/types";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui/Button";
import { readUpdate } from "@/lib/projects/settingsForm";

const targetLabels = { cloud: "클라우드", onprem: "내 PC" } as const;
const statusLabels: Record<DeploymentStatus, string> = {
  queued: "배포 대기",
  running: "배포 중",
  succeeded: "배포 완료",
  failed: "배포 실패",
  "rolled-back": "롤백 완료",
};
export function ProjectItem({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: (value: Project) => void;
}) {
  const lock = useRef(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [place, setPlace] = useState<"cloud" | "onprem" | null>(null);
  const [error, setError] = useState("");
  const latest = project.latestDeployment;
  const watchedBranch = project.branch || "main";
  const canRedeploy =
    latest !== null && latest.status !== "queued" && latest.status !== "running";
  const settled = latest?.status === "succeeded";
  useEffect(() => {
    if (!settled) return;
    let stop = false;
    projectRequest<{ home: "cloud" | "onprem" | null }>(
      `/api/projects/${project.id}/home`,
    )
      .then((data) => {
        if (!stop)
          setPlace(data.home === "cloud" || data.home === "onprem" ? data.home : null);
      })
      .catch(() => {
        if (!stop) setPlace(null);
      });
    return () => {
      stop = true;
    };
  }, [project.id, settled]);
  async function move() {
    if (!place || lock.current) return;
    const next = place === "cloud" ? "onprem" : "cloud";
    lock.current = true;
    setMoving(true);
    setError("");
    try {
      const result = await projectRequest<{ home: "cloud" | "onprem" }>(
        `/api/projects/${project.id}/home`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ home: next }),
        },
      );
      setPlace(result.home);
    } catch (error) {
      setError(
        error instanceof ProjectError
          ? error.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      lock.current = false;
      setMoving(false);
    }
  }
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
        {targetLabels[project.target]} ·{" "}
        {project.latestDeployment
          ? statusLabels[project.latestDeployment.status]
          : "배포 기록 없음"}
      </p>
      {latest?.message &&
        (latest.status === "failed" || latest.status === "rolled-back") && (
          <p className="mt-1 break-words text-caption text-mute">
            {latest.message}
          </p>
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
      <WebhookSetup project={project} branch={watchedBranch} />
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
          <button
            type="button"
            disabled={moving}
            onClick={() => {
              setEditing(true);
              setError("");
            }}
            className="text-mute hover:text-ink disabled:opacity-40"
          >
            설정
          </button>
          {canRedeploy && (
            <button
              type="button"
              onClick={redeploy}
              disabled={busy || moving}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              {busy ? "요청 중…" : "다시 배포"}
            </button>
          )}
          {place && (
            <button
              type="button"
              onClick={move}
              disabled={busy || moving}
              className="text-mute hover:text-ink disabled:opacity-40"
            >
              {moving
                ? "옮기는 중…"
                : place === "cloud"
                  ? "내 PC로 옮기기"
                  : "클라우드로 옮기기"}
            </button>
          )}
          {project.latestDeployment?.status === "succeeded" &&
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
      <p role="alert" className="mt-2 text-caption text-danger">
        {error}
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
      <CopyLine label="Secret" value={project.webhookSecret} />
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
