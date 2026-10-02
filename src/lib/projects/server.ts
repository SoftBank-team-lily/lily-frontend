import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type {
  Project,
  ProjectPage,
  Deployment,
  DeploymentStatus,
  DeployTarget,
  DeploySettings,
  DatabaseChoice,
  DatabaseLocation,
  Diagnosis,
  ProjectEntry,
} from "./types";
import type { ProjectFix, ProjectUpdate } from "./schema";
import { autoFixAttempt } from "@/lib/builder/run";
import { appAction, clusterApps, routeUpstream, runtimeOf } from "./apps";
import { getAgent } from "@/lib/agents/server";
import type { AppRuntime } from "./types";

type Row = {
  id: string;
  repo: string;
  name: string;
  target: DeployTarget;
  database_location: DatabaseLocation | null;
  root_dir: string;
  branch: string | null;
  port: number | null;
  health_path: string | null;
  env_keys: string[];
  unset_keys: string[];
  created_at: Date;
  deployment_id: string | null;
  status: DeploymentStatus | null;
  url: string | null;
  message: string | null;
  stage: string | null;
  logs: string[] | null;
  diagnosis: Diagnosis | null;
  request_key: string | null;
  app_name: string | null;
  database: DatabaseChoice | null;
  fixed_app_name: string | null;
  move: "onprem" | null;
};
// url, message: 실행기(src/lib/builder)가 배포 결과 주소를 builder_runs 에 남긴다
const selectProject = `SELECT p.id, p.repo, p.name, p.target, p.database_location, p.database, p.app_name AS fixed_app_name,
  p.root_dir, p.branch, p.port, p.health_path,
  ARRAY(SELECT jsonb_object_keys(p.env) ORDER BY 1) AS env_keys,
  ARRAY(SELECT key FROM jsonb_each_text(p.env) WHERE value='unset' ORDER BY 1) AS unset_keys, p.created_at, d.id AS deployment_id, d.status, r.url, r.message, r.stage, r.logs,
  r.diagnosis, d.request_key, d.move,
  (SELECT r2.app_name FROM builder_runs r2 JOIN deployments d2 ON d2.id=r2.deployment_id
    WHERE d2.project_id=p.id AND r2.app_name<>'' ORDER BY r2.created_at DESC LIMIT 1) AS app_name
  FROM projects p LEFT JOIN LATERAL (
    SELECT id, status, request_key, move FROM deployments WHERE project_id=p.id ORDER BY created_at DESC, id DESC LIMIT 1
  ) d ON true
  LEFT JOIN builder_runs r ON r.deployment_id=d.id`;
/** @param apps 클러스터 앱 상태. 넘기지 않으면 runtime 은 null (builder 를 부르지 않는다) */
function project(row: Row, apps: Map<string, AppRuntime> | null = null): Project {
  return {
    id: row.id,
    repo: row.repo,
    name: row.name,
    target: row.target,
    databaseLocation: row.target === "onprem" ? (row.database_location ?? null) : null,
    database: row.database ?? null,
    movedFromCloud: row.target === "onprem" && row.fixed_app_name !== null,
    rootDir: row.root_dir,
    branch: row.branch,
    port: row.port,
    healthPath: row.health_path,
    envKeys: row.env_keys,
    unsetKeys: row.unset_keys ?? [],
    createdAt: row.created_at.toISOString(),
    runtime: row.target === "cloud" ? runtimeOf(apps, row.app_name) : null,
    latestDeployment:
      row.deployment_id && row.status
        ? {
            id: row.deployment_id,
            status: row.status,
            url: row.url,
            message: row.message,
            stage: row.stage,
            logs: row.logs ?? [],
            diagnosis: row.diagnosis ?? null,
            autoFixed: row.request_key?.startsWith(AUTO_FIX_KEY) ?? false,
            autoFixAttempt: autoFixAttempt(row.request_key),
            move: row.move ?? null,
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
  const apps = rows.some((row) => row.target === "cloud" && row.app_name)
    ? await clusterApps()
    : null;
  const items = rows.map((row) => project(row, apps));
  return {
    items,
    nextCursor: result.rows.length > limit ? items.at(-1)!.id : null,
  };
}
async function projectRow(ownerId: string, id: string) {
  const result = await db.query<Row>(
    `${selectProject} WHERE p.id=$1 AND p.owner_id=$2`,
    [id, ownerId],
  );
  if (!result.rows[0])
    throw new ApiError(404, "NOT_FOUND", "프로젝트를 찾을 수 없어요.");
  return result.rows[0];
}
/** @param withRuntime true 면 클러스터 앱 상태도 채운다 (builder 를 부른다) */
export async function getProject(
  ownerId: string,
  id: string,
  withRuntime = false,
): Promise<Project> {
  const row = await projectRow(ownerId, id);
  return project(
    row,
    withRuntime && row.target === "cloud" && row.app_name ? await clusterApps() : null,
  );
}
/** 중지·시작·삭제 전에 본다. 배포가 진행 중이면 실행기가 곧 앱을 다시 만들거나 바꾼다 */
function assertIdle(row: Row) {
  if (row.status === "queued" || row.status === "running")
    throw new ApiError(
      409,
      "DEPLOYING",
      "배포가 진행 중이에요. 끝난 뒤에 다시 시도해 주세요.",
    );
}
/**
 * 클라우드 앱을 내린다(모든 슬롯 0) 또는 다시 띄운다. Service·Ingress·DB 는 남는다.
 * 다시 배포해도 기본 레플리카로 뜬다.
 */
export async function setRunning(ownerId: string, id: string, running: boolean) {
  const row = await projectRow(ownerId, id);
  if (row.target !== "cloud")
    throw new ApiError(
      409,
      "ONPREM",
      "온프레미스 앱은 내 PC 에서 에이전트를 멈춰 주세요.",
    );
  assertIdle(row);
  if (!row.app_name || !(await appAction(row.app_name, running ? "start" : "stop")))
    throw new ApiError(
      409,
      "NOT_RUNNING",
      "클러스터에 이 앱이 없어요. 다시 배포해 주세요.",
    );
  return getProject(ownerId, id, true);
}
/**
 * 프로젝트를 지운다. 클라우드면 클러스터의 앱(Deployment·Service·Ingress·Secret)을 먼저 지우고,
 * database 면 앱 DB 도 DROP 한다. 배포 기록은 프로젝트와 같이 지워진다 (ON DELETE CASCADE).
 * 온프레미스는 플랫폼 기록만 지운다 (내 PC 의 앱은 에이전트를 멈추면 내려간다).
 */
export async function deleteProject(ownerId: string, id: string, database: boolean) {
  const row = await projectRow(ownerId, id);
  assertIdle(row);
  let removed = false;
  if (row.target === "cloud" && row.app_name)
    removed = await appAction(row.app_name, "delete", database);
  await db.query("DELETE FROM projects WHERE id=$1 AND owner_id=$2", [id, ownerId]);
  return { id, removed };
}
/** 에이전트의 앱 이름 규칙 (lily-on-premise DeployJob). 클라우드 앱 이름이 이보다 길면 내 PC 로 옮길 수 없다 */
const AGENT_APP_NAME = /^[a-z][a-z0-9-]{0,30}$/;
/** 클라우드로 되돌릴 때 클러스터 앱이 다 뜰 때까지 기다리는 시간 */
const START_WAIT_MS = 120_000;

/**
 * 클라우드 앱을 내 PC 로 옮기는 배포를 만든다. 실행기가 같은 앱 이름으로 에이전트에 배포하고,
 * 끝나면 클러스터 Ingress 를 내 PC 로 넘긴 뒤 클라우드를 내린다 (src/lib/builder/worker.ts finishMove).
 *
 * @param database DB 있는 앱의 DB 위치. cloud: RDS 그대로, local: RDS 데이터를 내 PC DB 로 옮긴다 (postgres 만)
 */
export async function moveToOnPrem(
  ownerId: string,
  id: string,
  database: "cloud" | "local" | null,
) {
  const row = await projectRow(ownerId, id);
  if (row.target !== "cloud")
    throw new ApiError(409, "ALREADY_ONPREM", "이미 내 PC 에서 돌고 있어요.");
  assertIdle(row);
  if (row.status !== "succeeded" || !row.app_name)
    throw new ApiError(409, "NOT_DEPLOYED", "클라우드 배포가 끝난 앱만 옮길 수 있어요.");
  if (!AGENT_APP_NAME.test(row.app_name))
    throw new ApiError(
      409,
      "NAME_TOO_LONG",
      "앱 이름이 31자를 넘어 내 PC 로 옮길 수 없어요. 짧은 이름으로 다시 등록해 주세요.",
    );
  const agent = await getAgent(ownerId);
  if (!agent?.connected)
    throw new ApiError(409, "NO_AGENT", "내 PC 에이전트를 먼저 연결해 주세요.");
  const hasDatabase = row.database === "postgres" || row.database === "mysql";
  const location = hasDatabase ? (database ?? "cloud") : null;
  if (location === "local" && row.database !== "postgres")
    throw new ApiError(400, "UNSUPPORTED_DATABASE", "DB 를 내 PC 로 옮기는 건 PostgreSQL 만 돼요.");
  if (location === "local" && !agent.database)
    throw new ApiError(409, "NO_TUNNEL", "에이전트에 DB 터널이 없어 RDS 데이터를 가져올 수 없어요.");
  await db.query("UPDATE projects SET app_name=$3 WHERE id=$1 AND owner_id=$2", [
    id,
    ownerId,
    row.app_name,
  ]);
  await db.query(
    `INSERT INTO deployments(id, project_id, request_key, move, move_database)
    VALUES ($1,$2,$3,'onprem',$4)`,
    [randomUUID(), id, `move-onprem-${randomUUID()}`, location],
  );
  return getProject(ownerId, id);
}

/**
 * 내 PC 로 옮긴 앱을 클라우드로 되돌린다: 클러스터 앱을 다시 띄우고, 다 뜨면 Ingress 를 클러스터로 돌린다.
 * DB 를 내 PC 로 옮긴 앱은 데이터가 PC 에만 있어 되돌리지 않는다.
 */
export async function moveToCloud(ownerId: string, id: string) {
  const row = await projectRow(ownerId, id);
  if (row.target !== "onprem" || !row.fixed_app_name)
    throw new ApiError(409, "NOT_MOVED", "클라우드에서 옮겨 온 앱만 되돌릴 수 있어요.");
  assertIdle(row);
  if (row.database_location === "local")
    throw new ApiError(
      409,
      "DATABASE_ON_PC",
      "DB 가 내 PC 에 있어서 클라우드로 되돌리면 데이터가 따라가지 않아요.",
    );
  const app = row.fixed_app_name;
  if (!(await appAction(app, "start")))
    throw new ApiError(409, "NOT_RUNNING", "클러스터에 이 앱이 없어요. 클라우드로 다시 배포해 주세요.");
  const deadline = Date.now() + START_WAIT_MS;
  while ((await clusterApps())?.get(app)?.state !== "running") {
    if (Date.now() > deadline)
      throw new ApiError(504, "START_TIMEOUT", "클라우드 앱이 2분 안에 뜨지 않았어요. 내 PC 가 계속 받아요.");
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  await routeUpstream(app, null);
  await db.query(
    "UPDATE projects SET target='cloud', database_location=NULL WHERE id=$1 AND owner_id=$2",
    [id, ownerId],
  );
  return getProject(ownerId, id, true);
}

/** 실행기가 실패를 자동으로 고쳐 다시 보낸 배포의 request_key 앞부분 */
export const AUTO_FIX_KEY = "auto-fix-";

/**
 * 앱 내부 비밀값 (JWT 서명 키 등). hex 라 Base64 로 디코드하는 앱(jjwt Decoders.BASE64)도 읽을 수 있고, 디코드해도 256비트를 넘는다
 */
export function generateSecret() {
  return randomBytes(48).toString("hex");
}

/**
 * 같은 사용자, 같은 레포의 다른 프로젝트에 저장된 값. 폴더마다 등록한 프로젝트(backend)에 넣은 키를 묶음 프로젝트(루트)에서 다시 쓴다
 */
async function siblingEnv(
  ownerId: string,
  repo: string,
  keys: string[],
  exceptId: string | null,
): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const result = await db.query<{ env: Record<string, string> }>(
    "SELECT env FROM projects WHERE owner_id=$1 AND repo=$2 AND ($3::uuid IS NULL OR id<>$3) ORDER BY created_at",
    [ownerId, repo, exceptId],
  );
  const found: Record<string, string> = {};
  for (const row of result.rows)
    for (const key of keys)
      if (found[key] === undefined && typeof row.env?.[key] === "string" && row.env[key] !== "")
        found[key] = row.env[key];
  return found;
}

/** 같은 레포의 다른 프로젝트에 값이 있는 키 (값은 돌려주지 않는다) */
export async function reusableKeys(ownerId: string, repo: string, keys: string[]) {
  return new Set(Object.keys(await siblingEnv(ownerId, repo, keys, null)));
}

/** 다른 프로젝트 값 → 랜덤 생성 → 사용자가 적은 값 순서로 덮는다 */
async function resolveEnv(
  ownerId: string,
  repo: string,
  projectId: string | null,
  input: { env?: Record<string, string>; generateEnv?: string[]; reuseEnv?: string[] },
) {
  const env: Record<string, string> = {
    ...(await siblingEnv(ownerId, repo, input.reuseEnv ?? [], projectId)),
  };
  for (const key of input.generateEnv ?? []) env[key] = generateSecret();
  return { ...env, ...(input.env ?? {}) };
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
        `온프레미스에는 프로젝트를 하나만 둘 수 있어요. 지금은 '${existing.rows[0].name}'이(가) 있어요.`,
      );
  }
  const id = randomUUID();
  const rootDir = settings.rootDir ?? "";
  await db.query(
    `INSERT INTO projects(id, owner_id, repo, name, target, branch, root_dir, port, health_path, env, database,
      database_location, database_url)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
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
      JSON.stringify(await resolveEnv(ownerId, repo, null, settings)),
      settings.database ?? null,
      // DB 가 없는 앱이면 위치도 없다
      target === "onprem" && settings.database !== "none" ? (settings.databaseLocation ?? null) : null,
      target === "onprem" && settings.databaseLocation === "external" ? (settings.databaseUrl ?? null) : null,
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
/**
 * 실패한 배포를 고친다. 환경변수를 넣고(랜덤 생성·다른 프로젝트 값 포함), 포트·헬스 경로·DB·앱 폴더를 바꾼다.
 * 앱 폴더와 DB 는 한 번도 배포에 성공하지 않은 프로젝트만 바꾼다 (앱 주소와 tenant DB 가 바뀐다).
 * @param redeploy true 면 바로 다시 배포한다
 */
export async function fixProject(
  ownerId: string,
  id: string,
  input: ProjectFix,
  redeploy: boolean,
) {
  const current = await getProject(ownerId, id);
  const values: unknown[] = [id, ownerId];
  const sets: string[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column}=$${values.length}`);
  };
  if (input.port !== undefined) set("port", input.port);
  if (input.healthPath !== undefined) set("health_path", input.healthPath || null);
  if (input.rootDir !== undefined || input.database !== undefined) {
    const succeeded = await db.query(
      "SELECT 1 FROM deployments WHERE project_id=$1 AND status='succeeded' LIMIT 1",
      [id],
    );
    if (succeeded.rowCount)
      throw new ApiError(
        409,
        "ALREADY_DEPLOYED",
        "이미 배포한 프로젝트는 앱 폴더와 DB 를 바꿀 수 없어요. 새 프로젝트로 등록해 주세요.",
      );
    if (input.rootDir !== undefined) {
      const taken = await db.query(
        "SELECT 1 FROM projects WHERE owner_id=$1 AND repo=$2 AND root_dir=$3 AND id<>$4",
        [ownerId, current.repo, input.rootDir, id],
      );
      if (taken.rowCount)
        throw new ApiError(
          409,
          "ALREADY_EXISTS",
          `'${input.rootDir}' 폴더는 이미 다른 프로젝트로 등록돼 있어요. 그 프로젝트를 다시 배포해 주세요.`,
        );
      set("root_dir", input.rootDir);
      set("name", input.rootDir ? `${current.repo.split("/")[1]}/${input.rootDir}` : current.repo.split("/")[1]);
    }
    if (input.database !== undefined) set("database", input.database);
  }
  const env = await resolveEnv(ownerId, current.repo, id, input);
  if (Object.keys(env).length) {
    values.push(JSON.stringify(env));
    sets.push(`env=env || $${values.length}::jsonb`);
  }
  if (sets.length)
    await db.query(
      `UPDATE projects SET ${sets.join(", ")} WHERE id=$1 AND owner_id=$2`,
      values,
    );
  if (redeploy) await createDeployment(ownerId, id, `fix-${randomUUID()}`);
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
      running: ["succeeded", "failed", "rolled-back"],
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
  if (process.env.DASHBOARD_ORIGIN) {
    destination = `/dashboard?project=${encodeURIComponent(result.id)}`;
  } else if (process.env.DASHBOARD_URL) {
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
      latestDeployment: {
        id: result.latestDeployment.id,
        status: "succeeded",
        url: result.latestDeployment.url,
        message: result.latestDeployment.message,
        stage: result.latestDeployment.stage,
        logs: result.latestDeployment.logs,
        diagnosis: result.latestDeployment.diagnosis,
        autoFixed: result.latestDeployment.autoFixed,
        autoFixAttempt: result.latestDeployment.autoFixAttempt,
        move: result.latestDeployment.move,
      },
    },
    destination,
  };
}
