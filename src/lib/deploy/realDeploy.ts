import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { DeploySettings, DeployTarget, Project, ProjectPage } from "@/lib/projects/types";
import { toSlug } from "@/lib/repo/toSlug";
import { STAGES } from "./stages";
import { MAX_AUTO_FIX } from "@/lib/builder/run";
import { lastLine, stageIndex } from "./progress";
import type { DeployEvent, RepoRef } from "./types";

/** 로그인하지 않아 등록하지 못했다. 화면이 로그인으로 보낸다 */
export class NeedLogin extends Error {}

/** 진행 중 상태를 다시 읽는 주기 */
export const POLL_MS = 3000;

type Options = {
  repo: RepoRef;
  settings: DeploySettings;
  /** 배포 위치. 온프레미스는 연결된 에이전트가 띄운다 */
  target?: DeployTarget;
  signal: AbortSignal;
  emit: (event: DeployEvent) => void;
  request?: typeof projectRequest;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

/**
 * 레포를 프로젝트로 등록하고(이미 있으면 다시 배포) 실제 배포가 끝날 때까지 상태를 따라간다.
 * @throws NeedLogin 로그인하지 않았을 때
 */
export async function realDeploy({
  repo,
  settings,
  target = "cloud",
  signal,
  emit,
  request = projectRequest,
  wait = sleep,
}: Options) {
  emit({ type: "started", repo });
  emit({ type: "stage", index: 0 });
  let project: Project;
  try {
    project = await register(repo, settings, target, signal, request);
  } catch (error) {
    if (error instanceof ProjectError && error.status === 401) throw new NeedLogin();
    if (signal.aborted) return;
    emit({
      type: "failed",
      result: {
        repo,
        slug: toSlug(repo),
        outcome: "failed",
        message: error instanceof ProjectError ? error.message : "서버에 연결하지 못했어요.",
      },
    });
    return;
  }

  let shown = 0;
  /** 실패한 배포마다 한 번만 실행기의 자동 재배포를 기다린다 */
  const awaited = new Set<string>();
  for (;;) {
    signal.throwIfAborted();
    const status = project.latestDeployment?.status ?? "queued";
    if (
      status === "failed" &&
      project.latestDeployment?.diagnosis?.fixes.length &&
      (project.latestDeployment.autoFixAttempt ?? 0) < MAX_AUTO_FIX &&
      !awaited.has(project.latestDeployment.id)
    ) {
      awaited.add(project.latestDeployment.id);
      const retried = await awaitRetry(project, signal, request, wait);
      if (retried) {
        emit({ type: "log", line: `자동으로 고쳐 다시 배포해요: ${project.latestDeployment.diagnosis.cause}` });
        project = retried;
        continue;
      }
    }
    // 목록 화면에서 취소한 배포(cancelled)도 여기서는 끝난 실패로 보인다
    if (
      status === "succeeded" ||
      status === "failed" ||
      status === "rolled-back" ||
      status === "cancelled"
    ) {
      const result = {
        repo,
        slug: toSlug(repo),
        projectId: project.id,
        url: project.latestDeployment?.url ?? null,
        message: project.latestDeployment?.message ?? null,
        diagnosis: project.latestDeployment?.diagnosis ?? null,
        unsetKeys: project.unsetKeys ?? [],
      };
      if (status === "succeeded") {
        STAGES.forEach((_, index) => emit({ type: "progress", index, fraction: 1 }));
        emit({ type: "stage", index: STAGES.length - 1 });
        emit({ type: "succeeded", result: { ...result, outcome: "succeeded" } });
      } else {
        emit({ type: "threshold-exceeded" });
        emit({
          type: status === "rolled-back" ? "rolled-back" : "failed",
          result: { ...result, outcome: status === "rolled-back" ? "rolled-back" : "failed" },
        });
      }
      return;
    }
    // builder 가 남긴 실제 단계와 로그 (실행기가 몇 초마다 옮겨 둔다)
    const logs = project.latestDeployment?.logs ?? [];
    // 앞 단계로 돌아가 보이지 않게 한다
    const index = Math.max(shown, stageIndex(project.latestDeployment?.stage ?? null, logs));
    for (let stage = shown; stage < index; stage++)
      emit({ type: "progress", index: stage, fraction: 1 });
    emit({ type: "stage", index });
    emit({ type: "progress", index, fraction: 0.5 });
    emit({ type: "log", line: lastLine(logs) });
    shown = Math.max(shown, index);

    await wait(POLL_MS, signal);
    try {
      project = await request<Project>(`/api/projects/${project.id}`, { signal });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProjectError && error.status === 401) throw new NeedLogin();
      // 잠깐 끊긴 것. 다음 주기에 다시 읽는다
    }
  }
}

/** 같은 레포·폴더로 등록한 프로젝트 (위치는 상관없이). 없으면 null */
export async function findProject(
  repo: RepoRef,
  rootDir: string | undefined,
  signal?: AbortSignal,
  request: typeof projectRequest = projectRequest,
): Promise<Project | null> {
  const page = await request<ProjectPage>("/api/projects?limit=100", { signal });
  return (
    page.items.find(
      (item) =>
        item.repo === repo.toLowerCase() &&
        item.rootDir === (rootDir ?? "").replace(/^\/+|\/+$/g, ""),
    ) ?? null
  );
}

/** 이미 다른 위치에 등록한 레포. 레포·폴더는 계정에서 하나라 지우고 다시 등록해야 한다 */
export function otherTarget(project: Project, target: DeployTarget): ProjectError | null {
  if (project.target === target) return null;
  return new ProjectError(
    409,
    "ALREADY_EXISTS",
    `이 레포는 이미 ${targetLabels[project.target]}에 등록돼 있어요. 내 계정에서 지운 뒤 다시 배포해 주세요.`,
  );
}

const targetLabels: Record<DeployTarget, string> = { cloud: "클라우드", onprem: "온프레미스" };

/** 같은 레포·폴더가 같은 위치에 이미 등록돼 있으면 새로 만들지 않고 다시 배포한다 (DB 는 등록할 때 고른 그대로) */
async function register(
  repo: RepoRef,
  settings: DeploySettings,
  target: DeployTarget,
  signal: AbortSignal,
  request: typeof projectRequest,
): Promise<Project> {
  const existing = await findProject(repo, settings.rootDir, signal, request);
  if (!existing)
    return request<Project>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ repo, target, ...settings }),
    });
  const conflict = otherTarget(existing, target);
  if (conflict) throw conflict;
  await request(`/api/projects/${existing.id}/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    signal,
    body: "{}",
  });
  return request<Project>(`/api/projects/${existing.id}`, { signal });
}

/** 실패 직후 실행기가 새 배포를 만들 때까지 잠깐 기다린다. 안 생기면 null */
async function awaitRetry(
  project: Project,
  signal: AbortSignal,
  request: typeof projectRequest,
  wait: (ms: number, signal: AbortSignal) => Promise<void>,
): Promise<Project | null> {
  const failedId = project.latestDeployment?.id;
  for (let attempt = 0; attempt < 6; attempt++) {
    await wait(POLL_MS, signal);
    try {
      const next = await request<Project>(`/api/projects/${project.id}`, { signal });
      if (next.latestDeployment && next.latestDeployment.id !== failedId) return next;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return null;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
