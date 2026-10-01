import "server-only";
import { db } from "@/lib/db";
import { createDeployment, recordEvent } from "@/lib/projects/server";
import type { DatabaseChoice } from "@/lib/projects/types";
import {
  BuilderRejected,
  buildSettings,
  resultLine,
  runOnce,
  type RunDeps,
} from "./run";

// 서버 프로세스 안에서 주기적으로 runOnce 를 돌린다. src/instrumentation.ts 가 BUILDER_URL 이 있을 때만 켠다.

const REGISTER_KEY = "builder:register";
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
      }>(
        `SELECT d.id, d.project_id, p.repo, p.target, a.agent_key,
          p.branch, p.root_dir, p.port, p.health_path, p.env, p.database FROM deployments d
        JOIN projects p ON p.id=d.project_id
        LEFT JOIN agents a ON a.owner_id=p.owner_id
        LEFT JOIN builder_runs r ON r.deployment_id=d.id
        WHERE d.status='queued' AND r.deployment_id IS NULL
        ORDER BY d.created_at LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => ({
        deploymentId: row.id,
        projectId: row.project_id,
        repo: row.repo,
        target: row.target,
        agentKey: row.agent_key,
        settings: {
          branch: row.branch,
          rootDir: row.root_dir,
          port: row.port,
          healthPath: row.health_path,
          env: row.env,
          database: row.database,
        },
      }));
    },
    async active() {
      const result = await db.query<{
        id: string;
        status: "queued" | "running";
        build_id: string;
      }>(
        `SELECT d.id, d.status, r.build_id FROM builder_runs r
        JOIN deployments d ON d.id=r.deployment_id
        WHERE d.status IN ('queued','running') AND r.build_id IS NOT NULL ORDER BY r.created_at`,
      );
      return result.rows.map((row) => ({
        deploymentId: row.id,
        status: row.status,
        buildId: row.build_id,
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
        `INSERT INTO builder_runs(deployment_id, build_id, app_name, url, message)
        VALUES ($1, NULL, $2, $3, $4)
        ON CONFLICT (deployment_id) DO UPDATE SET
          url=COALESCE(EXCLUDED.url, builder_runs.url),
          message=COALESCE(EXCLUDED.message, builder_runs.message)`,
        [
          deploymentId,
          result.appName ?? "",
          result.url ?? null,
          result.message ?? null,
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
      };
      return {
        status: build.status,
        url: build.url ?? null,
        message: resultLine(build.logs),
        logs: build.logs ?? [],
      };
    },
    async saveProgress(deploymentId, stage, logs) {
      await db.query(
        "UPDATE builder_runs SET stage=$2, logs=$3::jsonb WHERE deployment_id=$1",
        [deploymentId, stage, JSON.stringify(logs)],
      );
    },
    async event(deploymentId, status) {
      // 이벤트 id 를 상태마다 고정해 같은 기록을 다시 보내도 한 번만 반영된다
      await recordEvent(deploymentId, `builder-${status}`, status);
    },
  };
}
