import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { recordStage, finishRun } from "./progress";
import { redact } from "@/lib/monitor/server";
import { ApiError, readJson, requireRunner } from "@/lib/api";
import { db } from "@/lib/db";
import { githubAppConfig, signAppJwt } from "@/lib/github/app";
import { createInstallationToken } from "@/lib/github/github-api";
import { builderUrl as configuredBuilderUrl } from "@/lib/projects/apps";
import { forbidden, remediate, type Incident, type ReasonCode } from "@/lib/remediate/flow";
import { openFixPullRequest } from "@/lib/remediate/github-pr";

const incidentSchema = z.object({
  app: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
  log: z.string().max(12000),
  files: z.array(z.string().min(1).max(300)
    .regex(/^[^\u0000-\u001f\u007f\\]+$/)
    .refine((path) => !forbidden(path))).max(20),
}).strict();
const draftSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("draft"), files: z.record(z.string(), z.string().max(500000)) }),
  z.object({ status: z.enum(["off", "rejected"]), reason: z.string().max(1000).optional() }),
]);

/** builder 초안 API 는 이유를 문장으로만 준다. 그 문장에서만 코드를 고른다 (서버가 정한 이유는 flow 가 코드를 붙인다) */
function builderReasonCode(reason: string): ReasonCode {
  if (reason.includes("동의")) return "consent";
  if (reason.includes("GitHub App")) return "github";
  if (reason.includes("커밋")) return "commit";
  if (reason.includes("서명의 PR")) return "duplicate";
  if (reason.includes("프레임")) return "no-files";
  if (reason.includes("코드 장애")) return "not-code";
  if (reason.includes("비웠다")) return "no-patch";
  if (reason.includes("꺼져")) return "disabled";
  return "draft-rejected";
}

type FixProject = {
  id: string; repo: string; branch: string | null; remediate: boolean;
  installation_id: string | null; commit_sha: string | null;
  deployment_id: string; env: Record<string, string>;
};

/** 접수 기록을 먼저 저장하고 응답한다. 같은 배포·사건은 한 번만 처리한다. */
export async function acceptIncident(request: Request) {
  requireRunner(request);
  const parsed = incidentSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiError(400, "BAD_REQUEST", "사건 내용을 확인해 주세요.");
  const incident = parsed.data;
  const found = await db.query<FixProject>(
    `SELECT p.id, p.repo, p.branch, p.remediate, p.env,
            p.github_installation_id::text AS installation_id, r.commit_sha, d.id AS deployment_id
     FROM builder_runs r JOIN deployments d ON d.id=r.deployment_id
     JOIN projects p ON p.id=d.project_id
     WHERE r.app_name=$1 AND d.status='succeeded'
     ORDER BY r.created_at DESC LIMIT 1`, [incident.app],
  );
  const row = found.rows[0];
  if (!row) return { status: "rejected", reason: "배포된 프로젝트가 없다" };
  if (!row.remediate) return { status: "off", reason: "프로젝트 동의가 꺼져 있다" };
  const id = randomUUID();
  const created = await db.query<{ id: string }>(
    `INSERT INTO fix_runs(id, project_id, deployment_id, signature, source_commit, stage, status, events)
     VALUES($1,$2,$3,$4,$5,'accepted','running',
       jsonb_build_array(jsonb_build_object('stage','accepted','at',now())))
     ON CONFLICT(project_id,deployment_id,signature) DO NOTHING RETURNING id`,
    [id, row.id, row.deployment_id, incident.signature, row.commit_sha ?? ""],
  );
  if (!created.rowCount) return { status: "duplicate" };
  // after는 영속 큐가 아니다. 중단된 작업은 조회 시 deadline으로 실패 처리한다.
  after(async () => {
    try { await runIncident(id, incident, row); }
    catch { await finishRun(id, "failed", "interrupted").catch(() => undefined); }
  });
  return { status: "accepted", runId: id };
}

async function runIncident(id: string, incident: Incident, row: FixProject) {
  let failure = "draft-unavailable";
  const deadline = AbortSignal.timeout(200000);
  const boundedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init, signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
  });
  const log = redact(incident.log, Object.values(row.env ?? {}));
  try {
    const open = await db.query<{ signature: string }>(
      `SELECT signature FROM remediation_prs WHERE project_id=$1 AND status='opened'`, [row.id],
    );
    const builderUrl = configuredBuilderUrl();
    const app = githubAppConfig();
    const appReady = Boolean(app.ready && app.privateKey && row.installation_id);
    // 설치 토큰은 1시간 유효하다. 초안과 PR 이 한 번 만든 토큰을 같이 쓴다
    let token: Promise<string> | undefined;
    const installationToken = () =>
      (token ??= createInstallationToken(signAppJwt(app.id, app.privateKey!), row.installation_id!, boundedFetch));
    const result = await remediate(incident, {
      enabled: process.env.REMEDIATE_ENABLED === "true", consent: row.remediate,
      installationId: row.installation_id, commitSha: row.commit_sha,
      openSignatures: open.rows.map((item) => item.signature),
    }, {
      progress: (stage, files) => recordStage(id, stage, files),
      draft: async () => {
        if (!builderUrl) return { status: "off", reason: "BUILDER_URL 이 없다", code: "disabled" };
        if (!appReady) return { status: "rejected", reason: "GitHub App 설치가 없다", code: "github" };
        const response = await fetch(`${builderUrl}/api/remediate/drafts`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: `https://github.com/${row.repo}`, token: await installationToken(),
            commit: row.commit_sha, log, files: incident.files }),
          signal: AbortSignal.any([deadline, AbortSignal.timeout(90000)]),
        });
        if (!response.ok) throw new Error("builder");
        const body = draftSchema.safeParse(await response.json());
        if (!body.success) return { status: "rejected", reason: "diff 응답 형식 오류", code: "draft-rejected" };
        if (body.data.status === "draft") {
          if (Object.keys(body.data.files).length > 3)
            return { status: "rejected", reason: "diff 파일 제한 초과", code: "draft-rejected" };
          return body.data;
        }
        const reason = body.data.reason ?? "diff를 만들지 못했다";
        return { status: body.data.status, reason, code: builderReasonCode(reason) };
      },
      openPull: async (files) => {
        failure = "github-unavailable";
        if (!appReady || !row.commit_sha) throw new Error("github");
        return openFixPullRequest({
          token: await installationToken(), repo: row.repo, base: row.branch ?? "main", commit: row.commit_sha,
          branch: `lily/fix-${id}`, title: "fix: Lily AI runtime repair",
          body: `${log}\n\nAI가 생성한 수정 PR입니다. 변경 내용을 검토한 뒤 적용해 주세요.`,
          files: Object.entries(files).map(([path, content]) => ({ path, content })),
        }, boundedFetch);
      },
    });
    await finishRun(id, result.status === "opened" ? "review" : "skipped", result.code, result.url ?? null);
    if (result.status !== "off") {
      await db.query(
        `INSERT INTO remediation_prs(id,project_id,app_name,signature,commit_sha,status,reason,pr_url)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [id, row.id, incident.app, incident.signature, row.commit_sha ?? "",
          result.status === "opened" ? "opened" : "rejected", result.code ?? "draft-rejected", result.url ?? null],
      );
    }
  } catch {
    await finishRun(id, "failed", failure);
  }
}
