// 배포 기록을 lily-builder 로 실행하는 한 주기. DB·HTTP 는 deps 로 받아 테스트에서 바꿔 끼운다.
//
// 프로젝트 등록           → 첫 배포(queued)
// queued 배포            → builder POST /api/builds (온프레미스면 /api/agents/{key}/builds) → running
// builder SUCCEEDED      → succeeded (접속 주소를 남긴다)
// 실패하면 이유 한 줄을 남긴다 (목록에 보인다)
// builder FAILED·ROLLED_BACK·기록 없음 → failed
// failed 이고 builder 진단(규칙 + AI)에 고칠 방법이 있으면 묻지 않고 설정을 고쳐 다시 배포한다
//   (비밀값 생성, 기본값, 외부 서비스 키는 unset, 포트·헬스 경로·DB·앱 폴더). 최대 MAX_AUTO_FIX 번,
//   같은 값으로 또 실패하면 그 전에 멈추고 화면이 원인과 입력 칸을 보인다
//
// 상태는 recordEvent 로만 바꾼다 (전환 규칙을 그대로 따른다).

import type { Diagnosis } from "@/lib/projects/types";

export type Pending = {
  deploymentId: string;
  projectId: string;
  repo: string;
  target: "cloud" | "onprem";
  /** 온프레미스 에이전트. onprem 인데 없으면 보내지 않고 failed */
  agentKey: string | null;
  settings?: DeploySettings;
};
/** message: builder 마지막 로그에서 뽑은 결과 한 줄 (실패 이유) */
export type BuildState = {
  status: string;
  url: string | null;
  message: string | null;
  /** 실패했을 때 원인과 고칠 방법 (lily-builder FailureDiagnoser) */
  diagnosis?: Diagnosis | null;
  /** builder 로그 끝부분. 화면이 진행 단계와 로그를 보여 준다 */
  logs?: string[];
};
/** 화면에 남기는 로그 줄 수 */
export const PROGRESS_LINES = 40;
export type RunResult = {
  appName?: string;
  url?: string | null;
  message?: string | null;
  diagnosis?: Diagnosis | null;
};
export type Active = {
  deploymentId: string;
  status: "queued" | "running";
  buildId: string;
};
export type FinalStatus = "succeeded" | "failed";

export class BuilderRejected extends Error {}

/** 등록할 때 정한 배포 설정. 비어 있는 값은 builder 가 레포를 보고 정한다 */
export type DeploySettings = {
  branch?: string | null;
  rootDir?: string | null;
  port?: number | null;
  healthPath?: string | null;
  env?: Record<string, string>;
  /** 등록할 때 사용자가 고른 DB. null 이면 BUILDER_DATABASE (auto) */
  database?: "postgres" | "mysql" | "none" | null;
};

export type RunDeps = {
  /** 배포 기록이 없는 프로젝트에 첫 배포를 만든다 */
  enqueueNewProjects(): Promise<number>;
  /** builder 로 아직 보내지 않은 queued 배포 */
  pending(limit: number): Promise<Pending[]>;
  /** builder 로 보냈고 끝나지 않은 배포 */
  active(): Promise<Active[]>;
  saveRun(deploymentId: string, buildId: string, appName: string): Promise<void>;
  /** 접속 주소나 실패 이유를 남긴다. builder 로 보내기 전 실패면 기록을 새로 만든다 */
  saveResult(deploymentId: string, result: RunResult): Promise<void>;
  /**
   * @param agentKey 온프레미스 에이전트. null 이면 클라우드
   * @throws BuilderRejected 다시 보내도 같은 거절
   */
  startBuild(
    repoUrl: string,
    appName: string,
    agentKey: string | null,
    settings?: DeploySettings,
  ): Promise<string>;
  /** builder 에 기록이 없으면 null */
  buildStatus(buildId: string): Promise<BuildState | null>;
  /**
   * 진단대로 설정을 고치고 다시 배포한다. 이미 자동으로 다시 보낸 배포면 false (한 번만)
   */
  autoFix?(deploymentId: string, diagnosis: Diagnosis): Promise<boolean>;
  /** 진행 중인 builder 상태와 로그 끝부분을 남긴다 */
  saveProgress?(deploymentId: string, stage: string, logs: string[]): Promise<void>;
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
      if (state)
        await deps.saveProgress?.(
          active.deploymentId,
          state.status,
          (state.logs ?? []).slice(-PROGRESS_LINES),
        );
      const result = finalStatus(state?.status ?? null);
      // queued 에서 바로 succeeded 로는 바꿀 수 없다. running 을 먼저 기록한다
      if (active.status === "queued")
        await deps.event(active.deploymentId, "running");
      if (result === "succeeded" && state?.url)
        await deps.saveResult(active.deploymentId, { url: state.url });
      if (result === "failed")
        await deps.saveResult(active.deploymentId, {
          message:
            state?.diagnosis?.cause ?? state?.message ?? "배포 서버에 이 배포 기록이 없어요.",
          diagnosis: state?.diagnosis ?? null,
        });
      if (result) {
        await deps.event(active.deploymentId, result);
        log(`배포 ${active.deploymentId}: ${result} (빌드 ${active.buildId})`);
      }
      if (result === "failed" && state?.diagnosis?.fixes.length && deps.autoFix) {
        try {
          if (await deps.autoFix(active.deploymentId, state.diagnosis))
            log(`배포 ${active.deploymentId}: 진단대로 고쳐 다시 배포합니다 (${state.diagnosis.cause})`);
        } catch (error) {
          log(`배포 ${active.deploymentId} 자동 고치기 실패: ${message(error)}`);
        }
      }
    } catch (error) {
      log(`배포 ${active.deploymentId} 상태 확인 실패: ${message(error)}`);
    }
  }

  const slots = deps.maxActive - (await deps.active()).length;
  if (slots <= 0) return;
  for (const pending of await deps.pending(slots)) {
    // 에이전트의 앱 이름은 31자까지다 (lily-on-premise)
    const app = appName(
      pending.repo,
      pending.projectId,
      pending.target === "onprem" ? 24 : 40,
      pending.settings?.rootDir,
    );
    const fail = (reason: string) =>
      safeFail(deps, pending.deploymentId, app, reason, log);
    if (!allowed(pending.repo, deps.allowedOwners)) {
      await fail(`이 레포 소유자는 배포할 수 없어요 (${pending.repo}).`);
      continue;
    }
    if (pending.target === "onprem" && !pending.agentKey) {
      await fail("온프레미스 에이전트가 연결되지 않았어요. '온프레미스 연결'에서 에이전트를 실행해 주세요.");
      continue;
    }
    try {
      const buildId = await deps.startBuild(
        `https://github.com/${pending.repo}`,
        app,
        pending.target === "onprem" ? pending.agentKey : null,
        pending.settings,
      );
      await deps.saveRun(pending.deploymentId, buildId, app);
      log(`배포 ${pending.deploymentId} → 빌드 ${buildId} (${app})`);
      await deps.event(pending.deploymentId, "running");
    } catch (error) {
      if (error instanceof BuilderRejected) {
        await fail(`배포 서버가 요청을 거절했어요: ${error.message}`);
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
 * 레포 이름(+ 폴더 이름) + 프로젝트 id 앞 6자리. 같은 레포를 여러 사람이 등록해도 겹치지 않는다.
 * k8s Service 이름이 되므로 영문 소문자로 시작한다.
 */
export function appName(
  repo: string,
  projectId: string,
  maxName = 40,
  rootDir?: string | null,
) {
  const folder = rootDir?.split("/").filter(Boolean).at(-1);
  let name = `${repo.slice(repo.indexOf("/") + 1)}${folder ? `-${folder}` : ""}`
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

/** builder 로 보내기 전에 끝난 배포: 이유를 남기고 failed */
async function safeFail(
  deps: RunDeps,
  deploymentId: string,
  app: string,
  reason: string,
  log: (message: string) => void,
) {
  log(`배포 ${deploymentId}: ${reason}`);
  try {
    await deps.saveResult(deploymentId, { appName: app, message: reason });
    await deps.event(deploymentId, "failed");
  } catch (error) {
    log(`배포 ${deploymentId} failed 기록 실패: ${message(error)}`);
  }
}

/**
 * builder 로그 마지막 줄 → 사람이 읽을 결과 한 줄.
 * 예: "agent: FAILED failed: health failed, ..." → "health failed, ..."
 */
export function resultLine(logs: string[] | undefined): string | null {
  const last = logs?.at(-1)?.trim();
  if (!last) return null;
  return last
    .replace(/^agent: (FAILED|SUCCEEDED)\s*/, "")
    .replace(/^(failed|rolled back|done):\s*/, "");
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** 프로젝트 배포 설정 → lily-builder BuildRequest 필드. 비어 있는 값은 보내지 않아 builder 가 정하게 둔다 */
export function buildSettings(settings: DeploySettings | undefined) {
  if (!settings) return {};
  const env = settings.env && Object.keys(settings.env).length ? settings.env : undefined;
  return {
    ...(settings.branch ? { branch: settings.branch } : {}),
    ...(settings.rootDir ? { rootDir: settings.rootDir } : {}),
    ...(settings.port ? { targetPort: settings.port } : {}),
    ...(settings.healthPath
      ? { readinessPath: settings.healthPath, livenessPath: settings.healthPath }
      : {}),
    ...(env ? { env } : {}),
    // 빈 문자열이면 builder 가 DB 없이 배포한다
    ...(settings.database
      ? { database: settings.database === "none" ? "" : settings.database }
      : {}),
  };
}

/** 실행기가 묻지 않고 다시 배포하는 최대 횟수. 같은 원인이 되풀이되면 그 전에 멈춘다 */
export const MAX_AUTO_FIX = 3;
/** 사용자만 아는 값(외부 서비스 키)을 비워 둘 때 넣는 값. 앱은 뜨고 그 기능만 동작하지 않는다 */
export const UNSET = "unset";

/**
 * 진단의 고칠 방법 → 프로젝트 고치기 입력. 묻지 않는다:
 * 비밀값은 생성, 기본값은 그대로, 외부 서비스 키는 unset, 앱 폴더는 진단이 고른 폴더.
 * 고칠 방법이 없으면 null (코드를 고쳐야 한다)
 */
export function fixInput(diagnosis: Diagnosis) {
  if (!diagnosis.fixes.length) return null;
  const input: {
    env: Record<string, string>;
    generateEnv: string[];
    port?: number;
    healthPath?: string;
    database?: "postgres" | "mysql" | "none";
    rootDir?: string;
  } = { env: {}, generateEnv: [] };
  for (const fix of diagnosis.fixes) {
    if (fix.type === "env" && fix.env) {
      if (fix.kind === "GENERATE") input.generateEnv.push(fix.env);
      else input.env[fix.env] = fix.kind === "DEFAULT" && fix.value !== null ? fix.value : UNSET;
    } else if (fix.type === "port" && fix.value && /^\d+$/.test(fix.value)) {
      input.port = Number(fix.value);
    } else if (fix.type === "healthPath" && fix.value) {
      input.healthPath = fix.value;
    } else if (fix.type === "database" && (fix.value === "postgres" || fix.value === "mysql")) {
      input.database = fix.value;
    } else if (fix.type === "rootDir" && (fix.value ?? fix.options[0])) {
      input.rootDir = fix.value ?? fix.options[0];
    }
  }
  return input;
}

/** auto-fix-{n}-{처음 실패한 배포 id}. 사용자가 시작한 배포면 0 */
export function autoFixAttempt(requestKey: string | null | undefined) {
  const match = /^auto-fix-(\d+)-/.exec(requestKey ?? "");
  if (match) return Number(match[1]);
  return requestKey?.startsWith("auto-fix-") ? 1 : 0;
}
