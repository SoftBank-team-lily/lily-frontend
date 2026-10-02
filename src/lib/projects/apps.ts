import "server-only";
import { ApiError } from "@/lib/api";
import type { AppRuntime, BuildProgress, BurstLive } from "./types";

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
    throw new ApiError(409, "AGENT_UNAVAILABLE", agentMessage(body?.message));
  }
  if (!response.ok) {
    console.error(`builder home cancel ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
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
    throw new ApiError(409, "AGENT_UNAVAILABLE", agentMessage(body?.message));
  }
  if (!response.ok) {
    console.error(`builder burst ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
}

function agentMessage(message: string | undefined) {
  if (message?.includes("최신 이미지"))
    return "에이전트가 예전 판이에요. 연결 명령으로 에이전트를 다시 실행해 주세요.";
  return "내 PC 에이전트가 연결돼 있지 않아요.";
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

/**
 * 클라우드 앱의 Ingress 를 내 PC 공개 호스트로 넘기거나(host) 클러스터로 되돌린다(null).
 * @returns builder·cicd 가 받았으면 true. 앱 Ingress 가 없으면 false
 */
export async function routeUpstream(appName: string, host: string | null): Promise<boolean> {
  const base = builderUrl();
  if (!base)
    throw new ApiError(503, "BUILDER_UNAVAILABLE", "배포 서버에 연결돼 있지 않아요.");
  const response = await fetch(`${base}/api/apps/${encodeURIComponent(appName)}/upstream`, {
    method: host ? "PUT" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: host ? JSON.stringify({ host }) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    console.error(`builder upstream ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
  return true;
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
  if (response.status === 409)
    throw new ApiError(
      409,
      "DEPLOYING",
      "배포나 롤백이 진행 중이에요. 끝난 뒤에 다시 시도해 주세요.",
    );
  if (!response.ok) {
    console.error(`builder ${action} ${appName}: ${response.status} ${await response.text()}`);
    throw new ApiError(502, "BUILDER_FAILED", "배포 서버가 요청을 처리하지 못했어요.");
  }
  return true;
}
