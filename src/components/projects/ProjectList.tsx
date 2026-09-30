"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { Project, ProjectPage } from "@/lib/projects/types";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui/Button";
import { ProjectItem } from "./ProjectItem";

export function ProjectList({ initialPage }: { initialPage: ProjectPage }) {
  const [page, setPage] = useState(initialPage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function request(operation: (signal: AbortSignal) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      await operation(abort.signal);
    } catch (error) {
      if (!abort.signal.aborted)
        setError(
          error instanceof ProjectError
            ? error.message
            : "서버에 연결하지 못했어요.",
        );
    } finally {
      lock.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await request(async (signal) => {
      await projectRequest<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          repo: String(data.get("repo")),
          ...(String(data.get("name") ?? "").trim()
            ? { name: String(data.get("name")).trim() }
            : {}),
        }),
      });
      const result = await projectRequest<ProjectPage>("/api/projects", {
        signal,
      });
      if (signal.aborted) return;
      setPage(result);
      form.reset();
    });
  }
  function reload(more = false) {
    void request(async (signal) => {
      const result = await projectRequest<ProjectPage>(
        `/api/projects${more && page.nextCursor ? `?cursor=${page.nextCursor}` : ""}`,
        { signal },
      );
      if (signal.aborted) return;
      setPage((previous) =>
        more
          ? {
              ...result,
              items: [
                ...previous.items,
                ...result.items.filter(
                  (item) => !previous.items.some((old) => old.id === item.id),
                ),
              ],
            }
          : result,
      );
    });
  }
  return (
    <section
      className="mt-10 border-t border-line pt-8"
      aria-labelledby="projects-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="projects-title" className="text-lead font-semibold">
          내 프로젝트
        </h2>
        <button
          type="button"
          onClick={() => reload()}
          disabled={busy}
          className="text-caption text-mute hover:text-ink disabled:opacity-40"
        >
          새로고침
        </button>
      </div>
      <p className="mt-2 text-caption text-mute">
        레포를 계정에 등록하세요. 실제 배포가 완료되면 꽃으로 대시보드를 열 수
        있어요.
      </p>
      <form onSubmit={create} className="mt-5 space-y-4" aria-busy={busy}>
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <AuthField
            id="project-repo"
            name="repo"
            label="GitHub 레포 주소"
            required
            maxLength={300}
            placeholder="github.com/owner/repo"
          />
          <AuthField
            id="project-name"
            name="name"
            label="프로젝트 이름 (선택)"
            maxLength={100}
          />
          <Button type="submit" variant="ghost">
            {busy ? "처리 중…" : "프로젝트 등록"}
          </Button>
        </fieldset>
      </form>
      <p role="alert" className="mt-3 text-caption text-danger">
        {error}
      </p>
      {page.items.length ? (
        <ul className="mt-5 space-y-4">
          {page.items.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              onUpdate={(value) =>
                setPage((previous) => ({
                  ...previous,
                  items: previous.items.map((item) =>
                    item.id === value.id ? value : item,
                  ),
                }))
              }
            />
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-note text-mute">등록된 프로젝트가 없어요.</p>
      )}
      {page.nextCursor && (
        <Button
          variant="ghost"
          className="mt-5 w-full"
          disabled={busy}
          onClick={() => reload(true)}
        >
          더 보기
        </Button>
      )}
    </section>
  );
}
