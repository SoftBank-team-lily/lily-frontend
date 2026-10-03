import "server-only";
import { ApiError } from "@/lib/api";
import type { AppRuntime, BuildProgress, BurstLive, ProjectSchema, WriteQueue } from "./types";

// 클러스터에 떠 있는 앱 상태와 중지·다시 시작·삭제. lily-builder 가 lily-cicd 로 넘긴다.
// builder /api/apps 는 lily-cicd 이름 규칙({app}-svc, {app}-{slot})을 읽어 앱마다 health 를 준다.

type ClusterApp = {
  appName: string;
  health: "HEALTHY" | "DEGRADED" | "DOWN" | "STOPPED";
  readyReplicas: number;
  replicas: number;
};

function builderUrl() {
  return process.env.BUILDER_URL?.replace(/\/+$/, "") || null;
}

/** 앱 이름 → 상태. builder 가 없거나 응답이 없으면 null (화면은 상태를 비워 둔다) */
export async function clusterApps(): Promise<Map<string, AppRuntime> | null> {
  const base = builderUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/apps`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const apps = (await response.json()) as ClusterApp[];
    return new Map(
      apps.map((app) => [
        app.appName,
        {
          state:
            app.health === "HEALTHY"
              ? "running"
              : app.health === "STOPPED"
                ? "stopped"
                : "starting",
          ready: app.readyReplicas,
          replicas: app.replicas,
        },
      ]),
    );
  } catch {
    return null;
  }
}

/** builder 가 돌려주는 버스팅 상태. state 는 에이전트가 보낸 burst-state 그대로, builds 는 에이전트가 기다리는 클라우드 빌드 */
export type BurstStatus = {
  connected: boolean;
  supported: boolean;
  state: BurstLive | null;
  builds?: { standbyBuild?: BuildProgress; homeBuild?: BuildProgress };
  /** 에이전트가 지금 다루는 앱. 이 앱이 아니면 state 가 비어 있다 */
  agentApp?: string;
};

/**
 * 진행 중인 거점 전환을 멈춘다. 주소를 바꾸기 전이면 에이전트가 출발 거점으로 되돌린다.
 * @throws ApiError 에이전트가 끊겼거나 취소를 모르는 판(409), builder 가 실패
 */
export async function cancelHome(appName: string) {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/home/cancel`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404)
    throw new ApiError(409, "NO_AGENT", "이 앱을 배포한 에이전트를 찾지 못했어요.");
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw agentError(body?.message);
  }
  if (!response.ok) {
    console.error(`builder home cancel ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
}

/**
 * 진행 중인 빌드를 멈춘다 (lily-builder POST /api/builds/{id}/cancel).
 * @return builder 가 멈췄으면 true, builder 에 그 빌드가 없으면 false
 * @throws ApiError 이미 멈출 수 없는 단계(409 NOT_CANCELLABLE), builder 가 실패
 */
export async function cancelBuild(buildId: string) {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const response = await fetch(`${base}/api/builds/${encodeURIComponent(buildId)}/cancel`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return false;
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(
      409,
      "NOT_CANCELLABLE",
      body?.message?.includes("lily-cicd")
        ? "새 버전을 띄우기 시작해서 취소할 수 없어요. 끝난 뒤 롤백해 주세요."
        : "이미 끝난 배포라 취소할 수 없어요.",
    );
  }
  if (!response.ok) {
    console.error(`builder cancel ${buildId}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
  return true;
}

/** 온프레미스 앱의 버스팅·거점 상태. 에이전트를 찾지 못했으면 connected=false, 확인하지 못했으면 null */
export async function burstStatus(appName: string): Promise<BurstStatus | null> {
  const base = builderUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/burst`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status === 404) return { connected: false, supported: false, state: null };
    if (!response.ok) return null;
    return (await response.json()) as BurstStatus;
  } catch {
    return null;
  }
}

/** 엣지 쓰기 큐 상태. builder 에서 큐가 꺼져 있으면 enabled=false, 확인하지 못했으면 null */
export async function writeQueueStatus(
  appName: string,
): Promise<{ enabled: true; queue: WriteQueue } | { enabled: false } | null> {
  const base = builderUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/write-queue`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) return { enabled: false };
    if (!response.ok) return null;
    return { enabled: true, queue: (await response.json()) as WriteQueue };
  } catch {
    return null;
  }
}

/**
 * 엣지 체크박스를 바꾼다. queue: 장애 중 쓰기 보관(모든 POST), snapshot: 장애 중 읽기 사본. 준 값만 바꾼다.
 * @throws ApiError builder 에서 큐가 꺼져 있음(409), 값이 맞지 않음(400), Cloudflare 에 닿지 못함(502)
 */
export async function sendWriteQueue(
  appName: string,
  change: { queue?: boolean; snapshot?: boolean },
): Promise<WriteQueue> {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/write-queue`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404)
    throw new ApiError(409, "QUEUE_OFF", "이 플랫폼에서는 엣지 쓰기 큐가 꺼져 있어요.");
  if (response.status === 400)
    throw new ApiError(400, "INVALID_EDGE_OPTIONS", "장애 대비 설정 값이 맞지 않아요.");
  if (!response.ok) {
    console.error(`builder write-queue ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "Cloudflare 에 설정을 저장하지 못했어요. 잠시 뒤 다시 바꿔 주세요.");
  }
  return (await response.json()) as WriteQueue;
}

/**
 * 버스팅 설정을 에이전트에 보낸다.
 * @throws ApiError 에이전트가 끊겼거나 버스팅을 모르는 판(409), builder 가 실패
 */
export async function sendBurst(appName: string, enabled: boolean, cloudPercent: number) {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/burst`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, cloudPercent }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404)
    throw new ApiError(409, "NO_AGENT", "이 앱을 배포한 에이전트를 찾지 못했어요. 다시 배포해 주세요.");
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw agentError(body?.message);
  }
  if (!response.ok) {
    console.error(`builder burst ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
}

/**
 * builder 가 에이전트 문제로 거절한 이유 → 화면 문구. 연결이 끊긴 경우만 AGENT_OFFLINE 이라 화면이 다시 붙으면 지운다.
 * 그 밖의 이유는 builder 문구를 그대로 보인다 (모두 "연결 안 됨"으로 바꾸면 진짜 이유가 가려진다)
 */
function agentError(message: string | undefined) {
  if (message?.includes("최신 이미지"))
    return new ApiError(409, "AGENT_OUTDATED", "에이전트가 예전 판이에요. 연결 명령으로 에이전트를 다시 실행해 주세요.");
  if (!message || message.includes("연결돼 있지 않"))
    return new ApiError(
      409,
      "AGENT_OFFLINE",
      "그 순간 내 PC 에이전트가 배포 서버와 끊겨 있었어요. 다시 붙으면 다시 눌러 주세요.",
    );
  return new ApiError(409, "AGENT_REJECTED", `에이전트가 거절했어요: ${message}`);
}

/**
 * 공개 주소의 거점을 옮긴다. builder 는 전환이 끝날 때까지 응답하지 않으므로 기다리지 않고,
 * 진행은 버스팅 상태(home·homeEvent)로 본다.
 */
export function moveHome(appName: string, home: "cloud" | "onprem", migrateDatabase = false) {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  void fetch(`${base}/api/apps/${encodeURIComponent(appName)}/home`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ home, migrateDatabase }),
    cache: "no-store",
    signal: AbortSignal.timeout(20 * 60_000),
  })
    .then(async (response) => {
      if (!response.ok) console.error(`builder home ${appName} ${home}: ${response.status} ${await response.text()}`);
    })
    .catch((error: unknown) => console.error(`builder home ${appName} ${home}:`, error));
}

export function runtimeOf(apps: Map<string, AppRuntime> | null, appName: string | null): AppRuntime | null {
  if (!apps || !appName) return null;
  return apps.get(appName) ?? { state: "absent", ready: 0, replicas: 0 };
}

/** 앱 공개 주소 {app}.{존} 의 거점. CLOUD: ALB, ONPREM: 내 PC 터널 (CNAME 내용물) */
export type AppAddress = { host: string; home: "CLOUD" | "ONPREM" | "NONE" | "OTHER"; content: string };

/** builder 가 Cloudflare 레코드를 읽어 준다. 없거나 응답이 없으면 null */
export async function appAddress(appName: string): Promise<AppAddress | null> {
  const base = builderUrl();
  if (!base) return null;
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/address`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error(`builder address ${appName}: ${response.status} ${await response.text()}`);
    return null;
  }
  return (await response.json()) as AppAddress;
}

/** 공개 주소를 클러스터(ALB)로 되돌린다. 내 PC 로 옮기다 실패했을 때. 받았으면 true */
export async function pointAddressToCloud(appName: string): Promise<boolean> {
  const base = builderUrl();
  if (!base) return false;
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/address`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ home: "cloud" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) console.error(`builder address ${appName} cloud: ${response.status} ${await response.text()}`);
  return response.ok;
}

/**
 * builder 에 중지·시작·삭제를 보낸다.
 * @returns 클러스터에 앱이 없으면 false (404)
 * @throws ApiError 배포 중(409)이거나 builder 가 실패
 */
export async function appAction(
  appName: string,
  action: "stop" | "start" | "delete",
  database = false,
): Promise<boolean> {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const app = encodeURIComponent(appName);
  const response = await fetch(
    action === "delete"
      ? `${base}/api/apps/${app}?database=${database}`
      : `${base}/api/apps/${app}/${action}`,
    {
      method: action === "delete" ? "DELETE" : "POST",
      cache: "no-store",
      // 삭제는 DB DROP 까지 기다린다
      signal: AbortSignal.timeout(action === "delete" ? 60_000 : 15_000),
    },
  );
  if (response.status === 404) return false;
  if (response.status === 409) {
    // 온프레미스 앱 삭제는 에이전트가 거절한 이유를 그대로 보인다 (예: 거점을 옮기는 중)
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(
      409,
      "DEPLOYING",
      action === "delete" && body?.message
        ? `지우지 못했어요: ${body.message}`
        : "배포나 롤백이 진행 중이에요. 끝난 뒤에 다시 시도해 주세요.",
    );
  }
  if (!response.ok) {
    console.error(`builder ${action} ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
  return true;
}

/** 클라우드 앱의 스키마 이력과 pgroll 롤백 창. 클러스터에 앱이 없거나 확인하지 못했으면 null */
export async function schemaHistory(appName: string): Promise<ProjectSchema | null> {
  const base = builderUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/schema`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ProjectSchema;
  } catch {
    return null;
  }
}

/**
 * pgroll 롤백 창을 바로 닫는다 (complete). 이후에는 스키마를 되돌릴 수 없다.
 * @throws ApiError 열린 창이 없거나 배포·롤백 중(409), builder 가 실패
 */
export async function completeSchema(appName: string) {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/schema/complete`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 409)
    throw new ApiError(409, "NO_WINDOW", "열린 롤백 창이 없거나 배포·롤백이 진행 중이에요.");
  if (!response.ok) {
    console.error(`builder schema complete ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
}
