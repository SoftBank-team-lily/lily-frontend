import "server-only";
import { ApiError } from "@/lib/api";
import type { AppRuntime } from "./types";

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

export function runtimeOf(apps: Map<string, AppRuntime> | null, appName: string | null): AppRuntime | null {
  if (!apps || !appName) return null;
  return apps.get(appName) ?? { state: "absent", ready: 0, replicas: 0 };
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
