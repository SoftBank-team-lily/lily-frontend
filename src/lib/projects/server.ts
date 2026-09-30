import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type {
  Project,
  ProjectPage,
  Deployment,
  DeploymentStatus,
  ProjectEntry,
} from "./types";

type Row = {
  id: string;
  repo: string;
  name: string;
  created_at: Date;
  deployment_id: string | null;
  status: DeploymentStatus | null;
};
const selectProject = `SELECT p.id, p.repo, p.name, p.created_at, d.id AS deployment_id, d.status
  FROM projects p LEFT JOIN LATERAL (
    SELECT id, status FROM deployments WHERE project_id=p.id ORDER BY created_at DESC, id DESC LIMIT 1
  ) d ON true`;
function project(row: Row): Project {
  return {
    id: row.id,
    repo: row.repo,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    latestDeployment:
      row.deployment_id && row.status
        ? { id: row.deployment_id, status: row.status }
        : null,
  };
}
export async function listProjects(
  ownerId: string,
  cursor: string | null = null,
  limit = 20,
): Promise<ProjectPage> {
  const result = await db.query<Row>(
    `${selectProject} WHERE p.owner_id=$1 AND
    ($2::uuid IS NULL OR (p.created_at, p.id) < (SELECT created_at, id FROM projects WHERE id=$2 AND owner_id=$1))
    ORDER BY p.created_at DESC, p.id DESC LIMIT $3`,
    [ownerId, cursor, limit + 1],
  );
  const items = result.rows.slice(0, limit).map(project);
  return {
    items,
    nextCursor: result.rows.length > limit ? items.at(-1)!.id : null,
  };
}
export async function getProject(
  ownerId: string,
  id: string,
): Promise<Project> {
  const result = await db.query<Row>(
    `${selectProject} WHERE p.id=$1 AND p.owner_id=$2`,
    [id, ownerId],
  );
  if (!result.rows[0])
    throw new ApiError(404, "NOT_FOUND", "프로젝트를 찾을 수 없어요.");
  return project(result.rows[0]);
}
export async function createProject(
  ownerId: string,
  repo: string,
  name?: string,
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO projects(id, owner_id, repo, name) VALUES($1,$2,$3,$4)",
    [id, ownerId, repo, name ?? repo.split("/")[1]],
  );
  return getProject(ownerId, id);
}
export async function updateProject(ownerId: string, id: string, name: string) {
  const result = await db.query(
    "UPDATE projects SET name=$3 WHERE id=$1 AND owner_id=$2 RETURNING id",
    [id, ownerId, name],
  );
  if (!result.rowCount)
    throw new ApiError(404, "NOT_FOUND", "프로젝트를 찾을 수 없어요.");
  return getProject(ownerId, id);
}
type DeploymentRow = {
  id: string;
  project_id: string;
  status: DeploymentStatus;
  created_at: Date;
  finished_at: Date | null;
};
function deployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}
export async function listDeployments(ownerId: string, projectId: string) {
  await getProject(ownerId, projectId);
  const result = await db.query<DeploymentRow>(
    "SELECT * FROM deployments WHERE project_id=$1 ORDER BY created_at DESC, id DESC LIMIT 100",
    [projectId],
  );
  return result.rows.map(deployment);
}
export async function createDeployment(
  ownerId: string,
  projectId: string,
  key: string,
) {
  await getProject(ownerId, projectId);
  const result = await db.query<DeploymentRow>(
    `INSERT INTO deployments(id, project_id, request_key)
    VALUES ($1,$2,$3) ON CONFLICT(project_id, request_key) DO UPDATE SET request_key=EXCLUDED.request_key RETURNING *`,
    [randomUUID(), projectId, key],
  );
  return deployment(result.rows[0]);
}
export async function recordEvent(
  deploymentId: string,
  eventId: string,
  status: Exclude<DeploymentStatus, "queued">,
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<DeploymentRow>(
      "SELECT * FROM deployments WHERE id=$1 FOR UPDATE",
      [deploymentId],
    );
    const row = found.rows[0];
    if (!row)
      throw new ApiError(404, "NOT_FOUND", "배포 기록을 찾을 수 없어요.");
    const existing = await client.query<{ status: string }>(
      "SELECT status FROM deployment_events WHERE deployment_id=$1 AND id=$2",
      [deploymentId, eventId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].status !== status)
        throw new ApiError(
          409,
          "EVENT_CONFLICT",
          "같은 이벤트 ID의 상태가 달라요.",
        );
      await client.query("COMMIT");
      return deployment(row);
    }
    const transitions: Record<DeploymentStatus, string[]> = {
      queued: ["running", "failed"],
      running: ["succeeded", "failed"],
      succeeded: ["rolled-back"],
      failed: ["rolled-back"],
      "rolled-back": [],
    };
    if (!transitions[row.status].includes(status))
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        "허용되지 않은 배포 상태 전환입니다.",
      );
    await client.query(
      "INSERT INTO deployment_events(deployment_id,id,status) VALUES ($1,$2,$3)",
      [deploymentId, eventId, status],
    );
    const result = await client.query<DeploymentRow>(
      "UPDATE deployments SET status=$2, finished_at=CASE WHEN $2='running' THEN NULL ELSE now() END WHERE id=$1 RETURNING *",
      [deploymentId, status],
    );
    await client.query("COMMIT");
    return deployment(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function getProjectEntry(
  ownerId: string,
  id: string,
): Promise<ProjectEntry> {
  const result = await getProject(ownerId, id);
  if (result.latestDeployment?.status !== "succeeded")
    throw new ApiError(
      409,
      "NOT_DEPLOYED",
      "정상 배포가 완료된 프로젝트만 열 수 있어요.",
    );
  let destination: string | null = null;
  if (process.env.DASHBOARD_URL) {
    const url = new URL(process.env.DASHBOARD_URL);
    if (
      url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    ) {
      throw new ApiError(
        503,
        "INVALID_DESTINATION",
        "대시보드 연결을 확인해 주세요.",
      );
    }
    url.searchParams.set("project", result.id);
    destination = url.toString();
  }
  return {
    project: {
      ...result,
      latestDeployment: { id: result.latestDeployment.id, status: "succeeded" },
    },
    destination,
  };
}
