import "server-only";
import { db } from "@/lib/db";
import { appAction, appAddress, cancelBuild, pointAddressToCloud } from "@/lib/projects/apps";
import {
  AUTO_FIX_KEY,
  createDeployment,
  fixProject,
  recordEvent,
} from "@/lib/projects/server";
import type { DatabaseChoice, DatabaseLocation, Diagnosis } from "@/lib/projects/types";
import {
  BuilderRejected,
  buildSettings,
  autoFixAttempt,
  fixInput,
  MAX_AUTO_FIX,
  resultLine,
  runOnce,
  type RunDeps,
} from "./run";

// 서버 프로세스 안에서 주기적으로 runOnce 를 돌린다. src/instrumentation.ts 가 BUILDER_URL 이 있을 때만 켠다.

const REGISTER_KEY = "builder:register";
/** 공개 주소 CNAME 을 내 PC 터널로 바꾼 뒤 그 주소로 확인하는 시간 (Cloudflare 반영 포함) */
const MOVE_PROBE_MS = 90_000;
/** 확인한 뒤 클라우드를 내리기까지. 클라우드에서 처리 중이던 요청이 끝나게 둔다 */
const MOVE_DRAIN_MS = 30_000;
const state = globalThis as typeof globalThis & { lilyBuilderWorker?: true };

export function startBuilderWorker() {
  if (state.lilyBuilderWorker) return;
  state.lilyBuilderWorker = true;
  const builderUrl = process.env.BUILDER_URL!.replace(/\/+$/, "");
  const database = process.env.BUILDER_DATABASE || null;
  const deps = realDeps(builderUrl, database);
  const interval = Number(process.env.BUILDER_POLL_MS) || 5000;
  console.log(`배포 실행기를 시작합니다. builder=${builderUrl}`);

  const loop = async () => {
    try {
      await runOnce(deps);
    } catch (error) {
      console.warn(
        "배포 실행기 주기를 완료하지 못했습니다.",
        error instanceof Error ? error.message : error,
      );
    } finally {
      setTimeout(loop, interval).unref();
    }
  };
  setTimeout(loop, interval).unref();
}

function realDeps(builderUrl: string, database: string | null): RunDeps {
  return {
    allowedOwners: (process.env.BUILDER_ALLOWED_OWNERS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    maxActive: Number(process.env.BUILDER_MAX_ACTIVE) || 2,
    log: (message) => console.log(`[builder] ${message}`),

    async enqueueNewProjects() {
      const result = await db.query<{ id: string; owner_id: string }>(
        `SELECT p.id, p.owner_id FROM projects p
        WHERE NOT EXISTS (SELECT 1 FROM deployments d WHERE d.project_id=p.id)
        ORDER BY p.created_at`,
      );
      for (const row of result.rows)
        await createDeployment(row.owner_id, row.id, REGISTER_KEY);
      return result.rowCount ?? 0;
    },
    async pending(limit) {
      const result = await db.query<{
        id: string;
        project_id: string;
        repo: string;
        target: "cloud" | "onprem";
        agent_key: string | null;
        branch: string | null;
        root_dir: string;
        port: number | null;
        health_path: string | null;
        env: Record<string, string>;
        database: DatabaseChoice | null;
        database_location: DatabaseLocation | null;
        database_url: string | null;
        deployment_mode: "HYBRID" | "ONPREM_ONLY";
        cloud_provider: "AWS" | "GCP";
        app_name: string | null;
        move: "onprem" | null;
        move_database: "cloud" | "local" | null;
        edge_snapshot: boolean | null;
        edge_queue: boolean | null;
      }>(
        `SELECT d.id, d.project_id, p.repo, p.target, a.agent_key,
          p.branch, p.root_dir, p.port, p.health_path, p.env, p.database,
          p.database_location, p.database_url, p.deployment_mode, p.cloud_provider, p.app_name, d.move, d.move_database,
          p.edge_snapshot, p.edge_queue FROM deployments d
        JOIN projects p ON p.id=d.project_id
        LEFT JOIN agents a ON a.owner_id=p.owner_id
        LEFT JOIN builder_runs r ON r.deployment_id=d.id
        WHERE d.status='queued' AND r.deployment_id IS NULL
        ORDER BY d.created_at LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => {
        if (row.move === "onprem")
          // 클라우드 앱을 내 PC 로: 같은 앱 이름(공개 주소·RDS)으로 에이전트에 보낸다
          return {
            deploymentId: row.id,
            projectId: row.project_id,
            repo: row.repo,
            target: "onprem" as const,
            agentKey: row.agent_key,
            appName: row.app_name,
            move: { database: row.move_database },
            settings: {
              branch: row.branch,
              rootDir: row.root_dir,
              port: row.port,
              healthPath: row.health_path,
              env: row.env,
              database: row.database,
              cloudProvider: row.cloud_provider ?? "AWS",
              ...(row.move_database
                ? { databaseLocation: row.move_database, importDatabase: row.move_database === "local" }
                : {}),
            },
          };
        return {
        deploymentId: row.id,
        projectId: row.project_id,
        repo: row.repo,
        target: row.target,
        agentKey: row.agent_key,
        appName: row.app_name,
        settings: {
          branch: row.branch,
          rootDir: row.root_dir,
          port: row.port,
          healthPath: row.health_path,
          env: row.env,
          database: row.database,
          deploymentMode: row.deployment_mode ?? "HYBRID",
          ...(row.deployment_mode === "ONPREM_ONLY"
            ? {}
            : { cloudProvider: row.cloud_provider === "GCP" ? "GCP" as const : "AWS" as const }),
          ...(row.deployment_mode === "ONPREM_ONLY"
            ? row.database && row.database !== "none"
              ? { databaseLocation: "local" as const }
              : {}
            : row.target === "onprem"
              ? { databaseLocation: row.database_location, databaseUrl: row.database_url }
              : {}),
          // 배포 화면의 엣지 체크박스 (온프레미스). null 이면 builder 에 보내지 않는다
          ...(row.target === "onprem" ? { edgeSnapshot: row.edge_snapshot, edgeQueue: row.edge_queue } : {}),
        },
        };
      });
    },
    async active() {
      const result = await db.query<{
        id: string;
        status: "queued" | "running";
        build_id: string;
        app_name: string;
        move: "onprem" | null;
        move_database: "cloud" | "local" | null;
      }>(
        `SELECT d.id, d.status, r.build_id, r.app_name, d.move, d.move_database FROM builder_runs r
        JOIN deployments d ON d.id=r.deployment_id
        WHERE d.status IN ('queued','running') AND r.build_id IS NOT NULL ORDER BY r.created_at`,
      );
      return result.rows.map((row) => ({
        deploymentId: row.id,
        status: row.status,
        buildId: row.build_id,
        move: row.move ? { database: row.move_database, appName: row.app_name } : null,
      }));
    },
    async saveRun(deploymentId, buildId, appName) {
      await db.query(
        "INSERT INTO builder_runs(deployment_id, build_id, app_name) VALUES ($1,$2,$3)",
        [deploymentId, buildId, appName],
      );
    },
    async saveResult(deploymentId, result) {
      // builder 로 보내기 전 실패면 기록이 없어서 새로 만든다 (build_id 없이)
      await db.query(
        `INSERT INTO builder_runs(deployment_id, build_id, app_name, url, message, diagnosis)
        VALUES ($1, NULL, $2, $3, $4, $5::jsonb)
        ON CONFLICT (deployment_id) DO UPDATE SET
          url=COALESCE(EXCLUDED.url, builder_runs.url),
          message=COALESCE(EXCLUDED.message, builder_runs.message),
          diagnosis=COALESCE(EXCLUDED.diagnosis, builder_runs.diagnosis)`,
        [
          deploymentId,
          result.appName ?? "",
          result.url ?? null,
          result.message ?? null,
          result.diagnosis ? JSON.stringify(result.diagnosis) : null,
        ],
      );
    },
    async startBuild(repoUrl, appName, agentKey, settings) {
      // 온프레미스는 builder 가 소켓으로 붙은 에이전트에 잡을 보낸다. 상태는 클라우드와 같은 /api/builds/{id}
      const path = agentKey ? `/api/agents/${agentKey}/builds` : "/api/builds";
      const response = await fetch(`${builderUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, appName, database, ...buildSettings(settings) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status >= 400 && response.status < 500)
        throw new BuilderRejected(`${response.status} ${await response.text()}`);
      if (!response.ok) throw new Error(`builder ${response.status}`);
      return ((await response.json()) as { id: string }).id;
    },
    async buildStatus(buildId) {
      const response = await fetch(
        `${builderUrl}/api/builds/${encodeURIComponent(buildId)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`builder ${response.status}`);
      const build = (await response.json()) as {
        status: string;
        url: string | null;
        logs?: string[];
        diagnosis?: Diagnosis | null;
        commit?: string | null;
      };
      return {
        status: build.status,
        url: build.url ?? null,
        message: resultLine(build.logs),
        logs: build.logs ?? [],
        diagnosis: build.diagnosis ?? null,
        commit: build.commit ?? null,
      };
    },
    async autoFix(deploymentId, diagnosis) {
      const found = await db.query<{
        request_key: string;
        project_id: string;
        owner_id: string;
        env: Record<string, string>;
        port: number | null;
        health_path: string | null;
        root_dir: string;
        database: string | null;
      }>(
        `SELECT d.request_key, d.project_id, p.owner_id, p.env, p.port, p.health_path, p.root_dir, p.database
        FROM deployments d JOIN projects p ON p.id=d.project_id WHERE d.id=$1`,
        [deploymentId],
      );
      const row = found.rows[0];
      if (!row) return false;
      const attempt = autoFixAttempt(row.request_key);
      if (attempt >= MAX_AUTO_FIX) return false;
      const input = fixInput(diagnosis);
      if (!input) return false;
      // 이미 넣은 값으로 또 실패했으면 같은 걸 다시 해도 소용없다
      const changes =
        input.generateEnv.some((key) => !row.env?.[key]) ||
        Object.entries(input.env).some(([key, value]) => row.env?.[key] !== value) ||
        (input.port !== undefined && input.port !== row.port) ||
        (input.healthPath !== undefined && input.healthPath !== row.health_path) ||
        (input.rootDir !== undefined && input.rootDir !== row.root_dir) ||
        (input.database !== undefined && input.database !== row.database);
      if (!changes) return false;
      await fixProject(row.owner_id, row.project_id, input, false);
      const origin = row.request_key.replace(/^auto-fix-\d+-/, "");
      await createDeployment(
        row.owner_id,
        row.project_id,
        `${AUTO_FIX_KEY}${attempt + 1}-${attempt ? origin : deploymentId}`,
      );
      return true;
    },
    async saveProgress(deploymentId, stage, logs) {
      await db.query(
        "UPDATE builder_runs SET stage=$2, logs=$3::jsonb WHERE deployment_id=$1",
        [deploymentId, stage, JSON.stringify(logs)],
      );
    },
    async saveCommit(deploymentId, sha) {
      await db.query("UPDATE builder_runs SET commit_sha=$2 WHERE deployment_id=$1", [deploymentId, sha]);
    },
    async freezeCloud(app) {
      await appAction(app, "stop");
    },
    async cancelMove(move) {
      // 에이전트가 주소를 터널로 바꾼 뒤에 실패했을 수도 있다. ALB 로 두는 건 이미 그쪽이면 아무것도 안 한다
      await pointAddressToCloud(move.appName).catch(() => false);
      // 클라우드는 DB 를 옮길 때만 내렸다
      if (move.database === "local") await appAction(move.appName, "start");
    },
    async finishMove(deploymentId, move, onPremUrl) {
      const fail = async (message: string) => {
        await pointAddressToCloud(move.appName).catch(() => false);
        if (move.database === "local") await appAction(move.appName, "start").catch(() => false);
        return { ok: false as const, message };
      };
      if (!onPremUrl || !safeHost(onPremUrl)) return fail("내 PC 공개 주소를 받지 못해 클라우드에 그대로 두었어요.");
      // 에이전트는 로컬 헬스·판정을 통과한 뒤에만 같은 주소({앱}.{존})의 CNAME 을 ALB 에서 터널로 바꾼다
      const address = await appAddress(move.appName).catch(() => null);
      if (address?.home !== "ONPREM")
        return fail("공개 주소를 내 PC 로 바꾸지 못해 클라우드에 그대로 두었어요.");
      const found = await db.query<{ project_id: string; health_path: string | null }>(
        "SELECT d.project_id, p.health_path FROM deployments d JOIN projects p ON p.id=d.project_id WHERE d.id=$1",
        [deploymentId],
      );
      const row = found.rows[0];
      if (!row) return fail("프로젝트를 찾지 못해 클라우드에 그대로 두었어요.");
      if (!(await reachable(onPremUrl, row.health_path)))
        return fail("공개 주소로 내 PC 앱에 닿지 않아 클라우드로 되돌렸어요.");
      await db.query(
        "UPDATE projects SET target='onprem', database_location=$2 WHERE id=$1",
        [row.project_id, move.database],
      );
      setTimeout(() => {
        appAction(move.appName, "stop").catch((error: unknown) =>
          console.warn(`[builder] ${move.appName} 클라우드 내리기 실패`, error),
        );
      }, MOVE_DRAIN_MS).unref();
      return { ok: true as const, url: onPremUrl };
    },
    async cancelled(deploymentId) {
      const found = await db.query<{ status: string }>("SELECT status FROM deployments WHERE id=$1", [deploymentId]);
      return found.rows[0]?.status === "cancelled";
    },
    async cancelBuild(buildId) {
      await cancelBuild(buildId);
    },
    async event(deploymentId, status) {
      // 이벤트 id 를 상태마다 고정해 같은 기록을 다시 보내도 한 번만 반영된다
      await recordEvent(deploymentId, `builder-${status}`, status);
    },
  };
}

function safeHost(url: string) {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/** 공개 주소가 5xx 없이 답할 때까지. CNAME 을 바꾼 직후 몇 초는 Cloudflare 가 아직 반영하지 못한다 */
async function reachable(url: string, healthPath: string | null) {
  const target = new URL(healthPath && healthPath !== "tcp" ? healthPath : "/", url).toString();
  const deadline = Date.now() + MOVE_PROBE_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status < 500) return true;
    } catch {
      // 다음에 다시
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return false;
}
