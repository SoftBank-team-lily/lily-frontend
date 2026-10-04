import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { getProject } from "@/lib/projects/server";
import { appName } from "@/lib/builder/run";
import { builderUrl as configuredBuilderUrl } from "@/lib/projects/apps";

export type Place = "cloud" | "onprem";

function builderUrl() {
  const url = configuredBuilderUrl();
  if (!url)
    throw new ApiError(503, "NOT_CONFIGURED", "배포 서버 연결을 설정해 주세요.");
  return url;
}

async function askBuilder(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage = "배포 서버에 연결하지 못했어요.",
) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(504, "BUILDER_UNAVAILABLE", timeoutMessage);
    }
    throw new ApiError(502, "BUILDER_UNAVAILABLE", "배포 서버에 연결하지 못했어요.");
  }
}

/** 이 사용자가 배포한 앱 이름. 기록에 있으면 그 이름을 쓰고, 없으면 배포할 때와 같은 규칙으로 만든다 */
export async function appOf(ownerId: string, projectId: string) {
  const project = await getProject(ownerId, projectId);
  const deploymentId = project.latestDeployment?.id;
  if (deploymentId) {
    const saved = await db.query<{ app_name: string }>(
      "SELECT app_name FROM builder_runs WHERE deployment_id=$1 AND app_name <> ''",
      [deploymentId],
    );
    if (saved.rows[0]?.app_name) return saved.rows[0].app_name;
  }
  if (project.latestDeployment?.status !== "succeeded")
    throw new ApiError(409, "NOT_DEPLOYED", "배포가 끝난 앱만 옮길 수 있어요.");
  return appName(
    project.repo,
    project.id,
    project.target === "onprem" ? 24 : 40,
    project.rootDir,
  );
}

/** 공개 주소가 지금 클라우드인지 내 PC인지. 레코드가 없거나 앱 주소가 아니면 null */
export async function readHome(ownerId: string, projectId: string) {
  const app = await appOf(ownerId, projectId);
  const response = await askBuilder(
    `${builderUrl()}/api/apps/${encodeURIComponent(app)}/address`,
    {},
    8000,
  );
  if (response.status === 503) return { home: null, app };
  if (!response.ok)
    throw new ApiError(502, "BUILDER_UNAVAILABLE", "배포 서버에 연결하지 못했어요.");
  const state = (await response.json()) as { home?: string };
  const home: Place | null =
    state.home === "CLOUD" ? "cloud" : state.home === "ONPREM" ? "onprem" : null;
  return { home, app };
}

/** 공개 주소의 거점만 바꾼다. DB는 옮기지 않는다 */
export async function moveHome(ownerId: string, projectId: string, home: Place) {
  const app = await appOf(ownerId, projectId);
  const response = await askBuilder(
    `${builderUrl()}/api/apps/${encodeURIComponent(app)}/home`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home, migrateDatabase: false }),
    },
    180_000,
    "옮기는 데 시간이 더 걸려요. 잠시 뒤 주소를 다시 확인해 주세요.",
  );
  const body = (await response.json().catch(() => null)) as {
    status?: string;
    message?: string;
    home?: string;
  } | null;
  if (!response.ok || body?.status !== "MOVED") {
    const status =
      response.status === 400 || response.status === 409 ? response.status : 502;
    throw new ApiError(status, "MOVE_FAILED", body?.message || "환경을 옮기지 못했어요.");
  }
  const moved = body.home === "cloud" || body.home === "onprem" ? body.home : home;
  return { home: moved };
}
