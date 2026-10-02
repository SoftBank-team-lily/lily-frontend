"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  detectRepo,
  projectRequest,
  ProjectError,
} from "@/lib/projects/client";
import type {
  Detection,
  DeployTarget,
  Project,
  ProjectPage,
} from "@/lib/projects/types";
import type { AgentState } from "@/lib/agents/types";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui/Button";
import { ProjectItem } from "./ProjectItem";
import { TargetChoice } from "./TargetChoice";
import { AgentPanel } from "./AgentPanel";
import { DeploySettingsFields } from "./DeploySettingsFields";
import { DeployCheckDialog, type DeployChoice } from "./DeployCheckDialog";
import { burstChanging } from "@/lib/projects/burst";
import { readSettings } from "@/lib/projects/settingsForm";

/** 배포가 진행 중이면(첫 배포가 만들어지기 전 포함) 목록을 다시 읽는 주기 */
const REFRESH_MS = 4000;
function inProgress(project: Project) {
  return (
    !project.latestDeployment ||
    project.latestDeployment.status === "queued" ||
    project.latestDeployment.status === "running" ||
    // 다시 시작했거나 배포 직후 Pod 가 아직 뜨는 중
    project.runtime?.state === "starting" ||
    // 버스팅 설정이 에이전트에 반영되는 중이거나, 켜져 있어 처리량이 바뀌거나, 거점을 옮기는 중
    burstChanging(project.burst)
  );
}

export function ProjectList({ initialPage }: { initialPage: ProjectPage }) {
  const [page, setPage] = useState(initialPage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<DeployTarget>("cloud");
  const [agent, setAgent] = useState<AgentState>(null);
  /** 배포 전 확인을 기다리는 등록. 생성을 누르면 고른 DB·폴더·설정을 넣어 등록한다 */
  const [choice, setChoice] = useState<{
    detection: Detection;
    body: Record<string, unknown> & { repo: string; env?: Record<string, string>; branch?: string };
    form: HTMLFormElement;
  } | null>(null);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const watching = page.items.some(inProgress);
  useEffect(() => {
    if (!watching) return;
    // 실행기가 배포를 진행하는 동안 상태만 조용히 바꾼다 (폼은 잠그지 않는다)
    const timer = setInterval(async () => {
      try {
        const latest = await projectRequest<ProjectPage>("/api/projects");
        setPage((previous) => ({
          ...previous,
          items: previous.items.map(
            (item) => latest.items.find((value) => value.id === item.id) ?? item,
          ),
        }));
      } catch {
        // 다음 주기에 다시 읽는다
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [watching]);
  const waitingAgent = target === "onprem" && !agent?.connected;
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
    let settings;
    try {
      settings = readSettings(data);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "입력 내용을 확인해 주세요.");
      return;
    }
    const body = {
      repo: String(data.get("repo")),
      target,
      ...settings,
      ...(String(data.get("name") ?? "").trim()
        ? { name: String(data.get("name")).trim() }
        : {}),
    };
    await request(async (signal) => {
      const detection = await detectRepo(body.repo, settings, signal);
      if (signal.aborted) return;
      setChoice({ detection, body, form });
    });
  }
  async function confirm(picked: DeployChoice) {
    if (!choice) return;
    const { body, form } = choice;
    setChoice(null);
    await request(async (signal) => {
      await projectRequest<Project>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          ...body,
          database: picked.database,
          ...(picked.databaseLocation ? { databaseLocation: picked.databaseLocation } : {}),
          ...(picked.databaseUrl ? { databaseUrl: picked.databaseUrl } : {}),
          ...(picked.rootDir !== undefined ? { rootDir: picked.rootDir } : {}),
          // 배포 설정 칸에 직접 적은 값이 이긴다
          env: { ...picked.env, ...(body.env ?? {}) },
          generateEnv: picked.generateEnv,
          reuseEnv: picked.reuseEnv,
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
        레포를 등록하면 바로 배포를 시작해요. Dockerfile이 없어도 돼요.
        백엔드와 프론트가 한 레포에 있으면 앱 폴더마다 하나씩 등록해 주세요.
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
          <DeploySettingsFields />
          <TargetChoice value={target} onChange={setTarget} />
          {target === "onprem" && <AgentPanel onChange={setAgent} />}
          <Button type="submit" variant="ghost" disabled={waitingAgent}>
            {busy ? "처리 중…" : "프로젝트 등록"}
          </Button>
          {waitingAgent && (
            <p className="text-caption text-mute">
              온프레미스 에이전트가 연결되면 등록할 수 있어요.
            </p>
          )}
        </fieldset>
      </form>
      <p role="alert" className="mt-3 text-caption text-danger">
        {error}
      </p>
      {choice && (
        <DeployCheckDialog
          detection={choice.detection}
          target={choice.body.target as DeployTarget}
          onCancel={() => setChoice(null)}
          onConfirm={(picked) => void confirm(picked)}
          redetect={(dir) =>
            detectRepo(choice.body.repo, { branch: choice.body.branch, rootDir: dir })
          }
        />
      )}
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
              onDelete={(id) =>
                setPage((previous) => ({
                  ...previous,
                  items: previous.items.filter((item) => item.id !== id),
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
