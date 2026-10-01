"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { Project, DeploymentStatus } from "@/lib/projects/types";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui/Button";

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
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const name = String(
      new FormData(event.currentTarget).get("name") ?? "",
    ).trim();
    if (!name || name.length > 100) {
      setError("프로젝트 이름은 1~100자로 입력해 주세요.");
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
          body: JSON.stringify({ name }),
        },
      );
      onUpdate(updated);
      setEditing(false);
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
      {editing ? (
        <form onSubmit={rename} className="mt-4 space-y-3" aria-busy={busy}>
          <AuthField
            id={`project-name-${project.id}`}
            name="name"
            label="프로젝트 이름"
            defaultValue={project.name}
            required
            maxLength={100}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
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
            이름 수정
          </button>
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
