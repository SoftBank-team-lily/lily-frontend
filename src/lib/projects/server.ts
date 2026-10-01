import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { createWebhookSecret, type WebhookProject } from "@/lib/github/webhook";
import type {
  Project,
  ProjectPage,
  Deployment,
  DeploymentStatus,
  DeployTarget,
  DeploySettings,
  ProjectEntry,
} from "./types";
import type { ProjectUpdate } from "./schema";

type Row = {
  id: string;
  repo: string;
  name: string;
  target: DeployTarget;
  root_dir: string;
  branch: string | null;
  port: number | null;
  health_path: string | null;
  env_keys: string[];
  webhook_secret: string | null;
  created_at: Date;
  deployment_id: string | null;
  status: DeploymentStatus | null;
  url: string | null;
  message: string | null;
  stage: string | null;
  logs: string[] | null;
};
// url, message: 실행기(src/lib/builder)가 배포 결과 주소를 builder_runs 에 남긴다
const selectProject = `SELECT p.id, p.repo, p.name, p.target, p.root_dir, p.branch, p.port, p.health_path,
  ARRAY(SELECT jsonb_object_keys(p.env) ORDER BY 1) AS env_keys, p.webhook_secret, p.created_at,
  d.id AS deployment_id, d.status, r.url, r.message, r.stage, r.logs
  FROM projects p LEFT JOIN LATERAL (
    SELECT id, status FROM deployments WHERE project_id=p.id ORDER BY created_at DESC, id DESC LIMIT 1
  ) d ON true
  LEFT JOIN builder_runs r ON r.deployment_id=d.id`;
function project(row: Row): Project {
  return {
    id: row.id,
    repo: row.repo,
    name: row.name,
    target: row.target,
    rootDir: row.root_dir,
    branch: row.branch,
    port: row.port,
    healthPath: row.health_path,
    envKeys: row.env_keys,
    webhookSecret: row.webhook_secret ?? "",
    webhookUrl: webhookUrl(),
    createdAt: row.created_at.toISOString(),
    latestDeployment:
      row.deployment_id && row.status
        ? {
            id: row.deployment_id,
            status: row.status,
            url: row.url,
            message: row.message,
            stage: row.stage,
            logs: row.logs ?? [],
          }
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
  const rows = result.rows.slice(0, limit);
  await ensureWebhookSecrets(rows);
  const items = rows.map(project);
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
  await ensureWebhookSecrets(result.rows);
  return project(result.rows[0]);
}
export async function createProject(
  ownerId: string,
  repo: string,
  name?: string,
  target: DeployTarget = "cloud",
  settings: DeploySettings = {},
) {
  if (target === "onprem") {
    // 에이전트 하나는 공개 주소 하나, 앱 하나만 띄운다 (lily-on-premise)
    const existing = await db.query<{ name: string }>(
      "SELECT name FROM projects WHERE owner_id=$1 AND target='onprem' LIMIT 1",
      [ownerId],
    );
    if (existing.rows[0])
      throw new ApiError(
        409,
        "ONPREM_LIMIT",
        `내 PC에는 프로젝트를 하나만 둘 수 있어요. 지금은 '${existing.rows[0].name}'이(가) 있어요.`,
      );
  }
  const id = randomUUID();
  const rootDir = settings.rootDir ?? "";
  await db.query(
    `INSERT INTO projects(id, owner_id, repo, name, target, branch, root_dir, port, health_path, env, webhook_secret)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      ownerId,
      repo,
      // 한 레포의 폴더마다 등록하면 이름으로 구분되게 폴더를 붙인다
      name ?? (rootDir ? `${repo.split("/")[1]}/${rootDir}` : repo.split("/")[1]),
      target,
      settings.branch || null,
      rootDir,
      settings.port ?? null,
      settings.healthPath || null,
      JSON.stringify(settings.env ?? {}),
      createWebhookSecret(),
    ],
  );
  return getProject(ownerId, id);
}
/** 이름과 배포 설정을 바꾼다. 다음 배포부터 쓴다 (지금 떠 있는 앱은 다시 배포해야 바뀐다) */
export async function updateProject(
  ownerId: string,
  id: string,
  input: ProjectUpdate,
) {
  const values: unknown[] = [id, ownerId];
  const sets: string[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column}=$${values.length}`);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.branch !== undefined) set("branch", input.branch || null);
  if (input.port !== undefined) set("port", input.port);
  if (input.healthPath !== undefined)
    set("health_path", input.healthPath || null);
  if (input.env !== undefined || input.removeEnv !== undefined) {
    // 지울 키를 먼저 빼고 새 값으로 덮는다. 적지 않은 키는 그대로 둔다
    values.push(input.removeEnv ?? [], JSON.stringify(input.env ?? {}));
    sets.push(
      `env=(env - $${values.length - 1}::text[]) || $${values.length}::jsonb`,
    );
  }
  const result = await db.query(
    `UPDATE projects SET ${sets.join(", ")} WHERE id=$1 AND owner_id=$2 RETURNING id`,
    values,
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
/** push 웹훅이 저장소 이름으로 프로젝트를 찾는다. 시크릿이 없는 예전 행은 서명에 맞지 않는다 */
export async function projectsForWebhook(repo: string): Promise<WebhookProject[]> {
  const result = await db.query<{
    id: string;
    owner_id: string;
    branch: string | null;
    webhook_secret: string | null;
  }>("SELECT id, owner_id, branch, webhook_secret FROM projects WHERE repo=$1", [
    repo,
  ]);
  return result.rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    branch: row.branch,
    secret: row.webhook_secret,
  }));
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
      webhookSecret: "",
      webhookUrl: "",
      latestDeployment: {
        id: result.latestDeployment.id,
        status: "succeeded",
        url: result.latestDeployment.url,
        message: result.latestDeployment.message,
        stage: result.latestDeployment.stage,
        logs: result.latestDeployment.logs,
      },
    },
    destination,
  };
}

function webhookUrl() {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) return "";
  try {
    return `${new URL(configured).origin}/api/github/webhook`;
  } catch {
    return "";
  }
}

/** 마이그레이션 전에 만든 프로젝트는 처음 조회할 때 시크릿을 채운다 */
async function ensureWebhookSecrets(rows: Row[]) {
  for (const row of rows) {
    if (row.webhook_secret) continue;
    const secret = createWebhookSecret();
    const updated = await db.query<{ webhook_secret: string }>(
      "UPDATE projects SET webhook_secret=$2 WHERE id=$1 AND webhook_secret IS NULL RETURNING webhook_secret",
      [row.id, secret],
    );
    if (updated.rows[0]) {
      row.webhook_secret = updated.rows[0].webhook_secret;
      continue;
    }
    const current = await db.query<{ webhook_secret: string | null }>(
      "SELECT webhook_secret FROM projects WHERE id=$1",
      [row.id],
    );
    const value = current.rows[0]?.webhook_secret;
    if (!value)
      throw new ApiError(404, "NOT_FOUND", "프로젝트를 찾을 수 없어요.");
    row.webhook_secret = value;
  }
}
