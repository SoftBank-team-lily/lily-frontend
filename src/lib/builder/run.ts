// 배포 기록을 lily-builder 로 실행하는 한 주기. DB·HTTP 는 deps 로 받아 테스트에서 바꿔 끼운다.
//
// 프로젝트 등록           → 첫 배포(queued)
// queued 배포            → builder POST /api/builds (내 PC 면 /api/agents/{key}/builds) → running
// builder SUCCEEDED      → succeeded (접속 주소를 남긴다)
// builder FAILED·ROLLED_BACK·기록 없음 → failed
//
// 상태는 recordEvent 로만 바꾼다 (전환 규칙을 그대로 따른다).

export type Pending = {
  deploymentId: string;
  projectId: string;
  repo: string;
  target: "cloud" | "onprem";
  /** 내 PC 에이전트. onprem 인데 없으면 보내지 않고 failed */
  agentKey: string | null;
};
export type BuildState = { status: string; url: string | null };
export type Active = {
  deploymentId: string;
  status: "queued" | "running";
  buildId: string;
};
export type FinalStatus = "succeeded" | "failed";

export class BuilderRejected extends Error {}

export type RunDeps = {
  /** 배포 기록이 없는 프로젝트에 첫 배포를 만든다 */
  enqueueNewProjects(): Promise<number>;
  /** builder 로 아직 보내지 않은 queued 배포 */
  pending(limit: number): Promise<Pending[]>;
  /** builder 로 보냈고 끝나지 않은 배포 */
  active(): Promise<Active[]>;
  saveRun(deploymentId: string, buildId: string, appName: string): Promise<void>;
  saveUrl(deploymentId: string, url: string): Promise<void>;
  /**
   * @param agentKey 내 PC 에이전트. null 이면 클라우드
   * @throws BuilderRejected 다시 보내도 같은 거절
   */
  startBuild(
    repoUrl: string,
    appName: string,
    agentKey: string | null,
  ): Promise<string>;
  /** builder 에 기록이 없으면 null */
  buildStatus(buildId: string): Promise<BuildState | null>;
  event(
    deploymentId: string,
    status: "running" | FinalStatus,
  ): Promise<void>;
  /** 등록할 수 있는 레포 소유자. 비어 있으면 모두 */
  allowedOwners: string[];
  maxActive: number;
  log?: (message: string) => void;
};

export async function runOnce(deps: RunDeps) {
  const log = deps.log ?? (() => {});
  const created = await deps.enqueueNewProjects();
  if (created) log(`새 프로젝트 ${created}개의 첫 배포를 만들었습니다.`);

  for (const active of await deps.active()) {
    try {
      const state = await deps.buildStatus(active.buildId);
      const result = finalStatus(state?.status ?? null);
      // queued 에서 바로 succeeded 로는 바꿀 수 없다. running 을 먼저 기록한다
      if (active.status === "queued")
        await deps.event(active.deploymentId, "running");
      if (result === "succeeded" && state?.url)
        await deps.saveUrl(active.deploymentId, state.url);
      if (result) {
        await deps.event(active.deploymentId, result);
        log(`배포 ${active.deploymentId}: ${result} (빌드 ${active.buildId})`);
      }
    } catch (error) {
      log(`배포 ${active.deploymentId} 상태 확인 실패: ${message(error)}`);
    }
  }

  const slots = deps.maxActive - (await deps.active()).length;
  if (slots <= 0) return;
  for (const pending of await deps.pending(slots)) {
    if (!allowed(pending.repo, deps.allowedOwners)) {
      log(`배포 ${pending.deploymentId}: 허용되지 않은 레포 ${pending.repo}`);
      await safeEvent(deps, pending.deploymentId, "failed", log);
      continue;
    }
    if (pending.target === "onprem" && !pending.agentKey) {
      log(`배포 ${pending.deploymentId}: 내 PC 가 연결되지 않았습니다`);
      await safeEvent(deps, pending.deploymentId, "failed", log);
      continue;
    }
    // 에이전트의 앱 이름은 31자까지다 (lily-on-premise)
    const app = appName(
      pending.repo,
      pending.projectId,
      pending.target === "onprem" ? 24 : 40,
    );
    try {
      const buildId = await deps.startBuild(
        `https://github.com/${pending.repo}`,
        app,
        pending.target === "onprem" ? pending.agentKey : null,
      );
      await deps.saveRun(pending.deploymentId, buildId, app);
      log(`배포 ${pending.deploymentId} → 빌드 ${buildId} (${app})`);
      await deps.event(pending.deploymentId, "running");
    } catch (error) {
      if (error instanceof BuilderRejected) {
        log(`배포 ${pending.deploymentId}: builder 거절 ${error.message}`);
        await safeEvent(deps, pending.deploymentId, "failed", log);
      } else {
        // builder 나 DB 가 잠깐 안 될 때. 다음 주기에 다시 보낸다
        log(`배포 ${pending.deploymentId} 시작 실패: ${message(error)}`);
      }
    }
  }
}

/** builder 상태 → 최종 상태. 진행 중이면 null */
export function finalStatus(builderStatus: string | null): FinalStatus | null {
  if (builderStatus === null) return "failed";
  if (builderStatus === "SUCCEEDED") return "succeeded";
  if (builderStatus === "FAILED" || builderStatus === "ROLLED_BACK")
    return "failed";
  return null;
}

/**
 * 레포 이름 + 프로젝트 id 앞 6자리. 같은 레포를 여러 사람이 등록해도 겹치지 않는다.
 * k8s Service 이름이 되므로 영문 소문자로 시작한다.
 */
export function appName(repo: string, projectId: string, maxName = 40) {
  let name = repo
    .slice(repo.indexOf("/") + 1)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (name.length > maxName) name = name.slice(0, maxName).replace(/-+$/, "");
  if (!/^[a-z]/.test(name)) name = name ? `app-${name}` : "app";
  return `${name}-${projectId.slice(0, 6)}`;
}

export function allowed(repo: string, owners: string[]) {
  if (!owners.length) return true;
  const owner = repo.slice(0, repo.indexOf("/")).toLowerCase();
  return owners.some((value) => value.toLowerCase() === owner);
}

async function safeEvent(
  deps: RunDeps,
  deploymentId: string,
  status: FinalStatus,
  log: (message: string) => void,
) {
  try {
    await deps.event(deploymentId, status);
  } catch (error) {
    log(`배포 ${deploymentId} ${status} 기록 실패: ${message(error)}`);
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
