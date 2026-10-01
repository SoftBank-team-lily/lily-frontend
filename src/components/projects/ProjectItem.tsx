"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
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
  const [error, setError] = useState("");
  const latest = project.latestDeployment;
  const canRedeploy =
    latest !== null && latest.status !== "queued" && latest.status !== "running";
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
