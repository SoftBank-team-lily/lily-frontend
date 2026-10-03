// 배포 기록을 lily-builder 로 실행하는 한 주기. DB·HTTP 는 deps 로 받아 테스트에서 바꿔 끼운다.
//
// 프로젝트 등록           → 첫 배포(queued)
// queued 배포            → builder POST /api/builds (온프레미스면 /api/agents/{key}/builds) → running
// builder SUCCEEDED      → succeeded (접속 주소를 남긴다)
// 실패하면 이유 한 줄을 남긴다 (목록에 보인다)
// builder FAILED·기록 없음 → failed, ROLLED_BACK → rolled-back, CANCELLED(사용자가 멈춤) → cancelled
// failed 이고 builder 진단(규칙 + AI)에 고칠 방법이 있으면 묻지 않고 설정을 고쳐 다시 배포한다
//   (비밀값 생성, 기본값, 외부 서비스 키는 unset, 포트·헬스 경로·DB·앱 폴더). 최대 MAX_AUTO_FIX 번,
//   같은 값으로 또 실패하면 그 전에 멈추고 화면이 원인과 입력 칸을 보인다
//
// 클라우드 앱을 내 PC 로 옮기는 배포(move):
//   DB 를 내 PC 로 옮기면 쓰기를 막으려고 클라우드를 먼저 내린다(freeze) → 같은 앱 이름으로 에이전트에 배포
//   → 에이전트가 헬스를 통과한 뒤 공개 주소({앱}.{존}) CNAME 을 ALB 에서 내 PC 터널로 바꾼다
//   → 성공하면 주소가 터널을 가리키는지와 응답을 확인한 뒤 클라우드를 내린다 (finishMove)
//   → 실패하면 CNAME 을 ALB 로, 클라우드를 되돌린다 (cancelMove). 이 배포는 자동으로 고쳐 다시 보내지 않는다
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
  /** 고정한 앱 이름 (내 PC 로 옮긴 프로젝트). 없으면 레포 이름으로 정한다 */
  appName?: string | null;
  /** 클라우드 앱을 내 PC 로 옮기는 배포 */
  move?: Move | null;
};
/** database: 옮길 때 DB 위치 (DB 없는 앱은 null). local 이면 RDS 데이터를 내 PC DB 로 옮긴다 */
export type Move = { database: "cloud" | "local" | null };
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
  /** 클라우드 앱을 내 PC 로 옮기는 배포. appName 은 builder 로 보낸 앱 이름 */
  move?: (Move & { appName: string }) | null;
};
/** 옮기기 마무리 결과. url: 그대로 쓰는 클라우드 주소 */
export type MoveOutcome = { ok: true; url: string } | { ok: false; message: string };
export type FinalStatus = "succeeded" | "failed" | "rolled-back" | "cancelled";
/** 취소한 배포에 남기는 결과 한 줄 (목록에 보인다) */
export const CANCELLED_MESSAGE = "배포를 취소했어요. 트래픽은 이전 버전 그대로예요.";

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
  /** 온프레미스 DB 위치 (local·external·cloud). null 이면 builder 기본값 cloud */
  databaseLocation?: "local" | "external" | "cloud" | null;
  /** external 일 때 DB 주소 */
  databaseUrl?: string | null;
  /** local 일 때 같은 앱 이름의 클라우드 RDS 데이터를 내 PC DB 로 옮긴다 (클라우드 앱을 옮길 때) */
  importDatabase?: boolean;
  /** HYBRID(기본) 또는 ONPREM_ONLY */
  deploymentMode?: "HYBRID" | "ONPREM_ONLY";
  /** 하이브리드의 클라우드. 비우면 AWS */
  cloudProvider?: "AWS" | "GCP";
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
  /** 옮기기 전 클라우드 쓰기를 막는다 (앱을 내린다). DB 를 내 PC 로 옮길 때만 */
  freezeCloud?(appName: string): Promise<void>;
  /** 내 PC 배포가 끝났다: 공개 주소가 내 PC 터널로 바뀌었는지 확인한 뒤 클라우드를 내린다. 실패하면 되돌린다 */
  finishMove?(deploymentId: string, move: Move & { appName: string }, onPremUrl: string | null): Promise<MoveOutcome>;
  /** 내 PC 배포가 실패했다: 내려 둔 클라우드를 다시 띄운다 */
  cancelMove?(move: Move & { appName: string }): Promise<void>;
  /** 사용자가 이 배포를 취소했다 (cancelled) */
  cancelled?(deploymentId: string): Promise<boolean>;
  /** builder 빌드를 멈춘다. 보내는 사이에 취소된 배포의 빌드 */
  cancelBuild?(buildId: string): Promise<void>;
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
      if (active.move && result) {
        await settleMove(deps, active, active.move, result, state, log);
        continue;
      }
      if ((result === "succeeded" || result === "rolled-back") && state?.url)
        await deps.saveResult(active.deploymentId, { url: state.url });
      if (result === "failed" || result === "rolled-back")
        await deps.saveResult(active.deploymentId, {
          message:
            state?.diagnosis?.cause ?? state?.message ?? "배포 서버에 이 배포 기록이 없어요.",
          diagnosis: state?.diagnosis ?? null,
        });
      if (result === "cancelled")
        await deps.saveResult(active.deploymentId, { message: CANCELLED_MESSAGE });
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
    const app =
      pending.appName ??
      appName(
        pending.repo,
        pending.projectId,
        pending.target === "onprem" ? 24 : 40,
        pending.settings?.rootDir,
      );
    const freezing = pending.move?.database === "local";
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
      // DB 를 옮기는 동안 클라우드에 쓰기가 들어오면 그 데이터는 내 PC 로 가지 않는다. 먼저 내린다
      if (freezing) await deps.freezeCloud?.(app);
      const buildId = await deps.startBuild(
        `https://github.com/${pending.repo}`,
        app,
        pending.target === "onprem" ? pending.agentKey : null,
        pending.settings,
      );
      await deps.saveRun(pending.deploymentId, buildId, app);
      log(`배포 ${pending.deploymentId} → 빌드 ${buildId} (${app})`);
      try {
        await deps.event(pending.deploymentId, "running");
      } catch (error) {
        // builder 로 보내는 사이에 사용자가 취소했다. 막 시작한 빌드를 멈추고 옮기던 클라우드를 되돌린다
        if (!(await deps.cancelled?.(pending.deploymentId))) throw error;
        await deps.cancelBuild?.(buildId).catch((problem: unknown) =>
          log(`배포 ${pending.deploymentId} 빌드 ${buildId} 멈추기 실패: ${message(problem)}`),
        );
        if (pending.move) await safeCancel(deps, { ...pending.move, appName: app }, log);
        log(`배포 ${pending.deploymentId}: 보내는 사이에 취소돼 빌드 ${buildId} 를 멈췄어요`);
      }
    } catch (error) {
      if (error instanceof BuilderRejected) {
        if (pending.move) await safeCancel(deps, { ...pending.move, appName: app }, log);
        await fail(`배포 서버가 요청을 거절했어요: ${error.message}`);
      } else {
        // builder 나 DB 가 잠깐 안 될 때. 다음 주기에 다시 보낸다
        log(`배포 ${pending.deploymentId} 시작 실패: ${message(error)}`);
      }
    }
  }
}

/** 옮기는 배포의 끝: 성공이면 주소가 내 PC 로 바뀌었는지 확인, 실패면 주소와 클라우드를 되돌린다 */
async function settleMove(
  deps: RunDeps,
  active: Active,
  move: Move & { appName: string },
  result: FinalStatus,
  state: BuildState | null,
  log: (message: string) => void,
) {
  if (result === "succeeded") {
    const outcome = deps.finishMove
      ? await deps.finishMove(active.deploymentId, move, state?.url ?? null)
      : ({ ok: false, message: "전환을 마무리할 수 없어요." } as const);
    if (outcome.ok) {
      await deps.saveResult(active.deploymentId, { url: outcome.url });
      await deps.event(active.deploymentId, "succeeded");
      log(`배포 ${active.deploymentId}: 클라우드 → 온프레미스 전환 완료 (${move.appName})`);
      return;
    }
    await deps.saveResult(active.deploymentId, { message: outcome.message });
    await deps.event(active.deploymentId, "failed");
    log(`배포 ${active.deploymentId}: 전환 실패 (${outcome.message})`);
    return;
  }
  await safeCancel(deps, move, log);
  if (result === "cancelled") {
    await deps.saveResult(active.deploymentId, {
      message: "내 PC 로 옮기기를 취소해서 클라우드에 그대로 두었어요.",
    });
    await deps.event(active.deploymentId, "cancelled");
    return;
  }
  await deps.saveResult(active.deploymentId, {
    message: `내 PC 배포에 실패해서 클라우드에 그대로 두었어요. ${
      state?.diagnosis?.cause ?? state?.message ?? ""
    }`.trim(),
    diagnosis: state?.diagnosis ?? null,
  });
  await deps.event(active.deploymentId, "failed");
}

async function safeCancel(
  deps: RunDeps,
  move: Move & { appName: string },
  log: (message: string) => void,
) {
  try {
    await deps.cancelMove?.(move);
  } catch (error) {
    log(`${move.appName} 클라우드 되돌리기 실패: ${message(error)}`);
  }
}

/** builder 상태 → 최종 상태. 진행 중이면 null */
export function finalStatus(builderStatus: string | null): FinalStatus | null {
  if (builderStatus === null) return "failed";
  if (builderStatus === "SUCCEEDED") return "succeeded";
  if (builderStatus === "FAILED") return "failed";
  if (builderStatus === "ROLLED_BACK") return "rolled-back";
  if (builderStatus === "CANCELLED") return "cancelled";
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
    ...(settings.deploymentMode ? { deploymentMode: settings.deploymentMode } : {}),
    ...(settings.deploymentMode === "ONPREM_ONLY"
      ? {}
      : settings.cloudProvider
        ? { cloudProvider: settings.cloudProvider }
        : {}),
    // 온프레미스 전용은 DB 를 내 PC 에만 둔다. RDS 터널과 데이터 옮기기는 보내지 않는다
    ...(settings.deploymentMode === "ONPREM_ONLY"
      ? settings.database && settings.database !== "none"
        ? { databaseMode: "local" as const }
        : {}
      : {
          ...(settings.databaseLocation ? { databaseMode: settings.databaseLocation } : {}),
          ...(settings.databaseLocation === "external" && settings.databaseUrl
            ? { databaseUrl: settings.databaseUrl }
            : {}),
          ...(settings.databaseLocation === "local" && settings.importDatabase
            ? { importDatabase: true }
            : {}),
        }),
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
