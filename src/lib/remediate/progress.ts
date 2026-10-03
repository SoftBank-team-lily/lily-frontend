import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { FixProgress, FixRun, FixStage } from "./types";

/** 서버가 확인한 단계와 허용된 경로만 기록한다. 모델이 쓴 문장은 화면으로 보내지 않는다. */
export async function recordStage(id: string, stage: FixStage, files?: string[]) {
  await db.query(
    `UPDATE fix_runs SET stage=$2, updated_at=now(),
      events=events || jsonb_build_array(jsonb_build_object('stage',$2::text,'at',now())),
      files=COALESCE($3::jsonb,files)
     WHERE id=$1 AND status='running'`,
    [id, stage, files ? JSON.stringify(files) : null],
  );
}

export async function finishRun(
  id: string,
  status: "review" | "skipped" | "failed",
  reasonCode: string | null = null,
  prUrl: string | null = null,
) {
  await db.query(
    `UPDATE fix_runs SET status=$2, reason_code=$3, pr_url=$4, updated_at=now(),
      stage=CASE WHEN $2='review' THEN 'review' ELSE stage END,
      events=CASE WHEN $2='review' THEN events || jsonb_build_array(
        jsonb_build_object('stage','review','at',now())) ELSE events END
     WHERE id=$1 AND status='running'`,
    [id, status, reasonCode, prUrl],
  );
}

export async function getFixProgress(ownerId: string, projectId: string): Promise<FixProgress> {
  const project = await db.query<{ remediate: boolean; github_app: boolean }>(
    `SELECT remediate, github_installation_id IS NOT NULL AS github_app
     FROM projects WHERE id=$1 AND owner_id=$2`, [projectId, ownerId],
  );
  if (!project.rows[0]) throw new ApiError(404, "NOT_FOUND", "프로젝트를 찾을 수 없어요.");
  // 서버가 중단된 작업은 성공으로 간주하지 않는다. 재시도는 새 배포에서만 한다.
  await db.query(
    `UPDATE fix_runs SET status='failed', reason_code='interrupted', updated_at=now()
     WHERE project_id=$1 AND status='running' AND deadline < now()`, [projectId],
  );
  const result = await db.query<{
    id: string; deployment_id: string; source_commit: string; stage: FixStage;
    status: FixRun["status"]; reason_code: string | null; files: string[];
    events: FixRun["events"]; pr_url: string | null; created_at: Date; updated_at: Date;
  }>(`SELECT id, deployment_id, source_commit, stage, status, reason_code, files,
      events, pr_url, created_at, updated_at FROM fix_runs
      WHERE project_id=$1 ORDER BY created_at DESC, id DESC LIMIT 10`, [projectId]);
  return {
    enabled: process.env.REMEDIATE_ENABLED === "true",
    consent: project.rows[0].remediate,
    githubApp: project.rows[0].github_app,
    runs: result.rows.map((row) => ({
      id: row.id, deploymentId: row.deployment_id, sourceCommit: row.source_commit,
      stage: row.stage, status: row.status, reasonCode: row.reason_code,
      files: row.files, events: row.events, prUrl: row.pr_url,
      startedAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    })),
  };
}
