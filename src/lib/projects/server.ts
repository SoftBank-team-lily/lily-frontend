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
  Diagnosis,
  ProjectEntry,
} from "./types";
import type { ProjectFix, ProjectUpdate } from "./schema";
import { autoFixAttempt } from "@/lib/builder/run";

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
};
// url, message: 실행기(src/lib/builder)가 배포 결과 주소를 builder_runs 에 남긴다
const selectProject = `SELECT p.id, p.repo, p.name, p.target, p.root_dir, p.branch, p.port, p.health_path,
  ARRAY(SELECT jsonb_object_keys(p.env) ORDER BY 1) AS env_keys,
  ARRAY(SELECT key FROM jsonb_each_text(p.env) WHERE value='unset' ORDER BY 1) AS unset_keys, p.created_at, d.id AS deployment_id, d.status, r.url, r.message, r.stage, r.logs,
  r.diagnosis, d.request_key
  FROM projects p LEFT JOIN LATERAL (
    SELECT id, status, request_key FROM deployments WHERE project_id=p.id ORDER BY created_at DESC, id DESC LIMIT 1
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
    unsetKeys: row.unset_keys ?? [],
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
            diagnosis: row.diagnosis ?? null,
            autoFixed: row.request_key?.startsWith(AUTO_FIX_KEY) ?? false,
            autoFixAttempt: autoFixAttempt(row.request_key),
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
    `INSERT INTO projects(id, owner_id, repo, name, target, branch, root_dir, port, health_path, env, database)
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
      JSON.stringify(await resolveEnv(ownerId, repo, null, settings)),
      settings.database ?? null,
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
      },
    },
    destination,
  };
}
