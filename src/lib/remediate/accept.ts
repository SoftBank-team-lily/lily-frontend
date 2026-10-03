import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { recordStage, finishRun } from "./progress";
import { redact } from "@/lib/monitor/server";
import { ApiError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { githubAppConfig, signAppJwt } from "@/lib/github/app";
import { createInstallationToken } from "@/lib/github/github-api";
import { forbidden, remediate, type Incident } from "@/lib/remediate/flow";
import { openFixPullRequest } from "@/lib/remediate/github-pr";

function authorized(request: Request) {
  const expected = process.env.DEPLOYMENT_API_KEY;
  if (!expected || expected.length < 32 || expected.startsWith("replace-")) {
    throw new ApiError(503, "NOT_CONFIGURED", "배포 실행기 연결을 설정해 주세요.");
  }
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${expected}`))) {
    throw new ApiError(401, "UNAUTHORIZED", "실행기 인증이 필요합니다.");
  }
}

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

function reasonCode(reason: string) {
  if (reason.includes("동의")) return "consent";
  if (reason.includes("GitHub App")) return "github";
  if (reason.includes("커밋")) return "commit";
  if (reason.includes("서명의 PR")) return "duplicate";
  if (reason.includes("프레임")) return "no-files";
  if (reason.includes("코드 장애")) return "not-code";
  if (reason.includes("비웠다")) return "no-patch";
  if (reason.includes("꺼져") || reason.includes("BUILDER_URL")) return "disabled";
  return "draft-rejected";
}

type FixProject = {
  id: string; repo: string; branch: string | null; remediate: boolean;
  installation_id: string | null; commit_sha: string | null;
  deployment_id: string; env: Record<string, string>;
};

/** 접수 기록을 먼저 저장하고 응답한다. 같은 배포·사건은 한 번만 처리한다. */
export async function acceptIncident(request: Request) {
  authorized(request);
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
    const builderUrl = process.env.BUILDER_URL?.replace(/\/+$/, "") ?? "";
    const result = await remediate(incident, {
      enabled: process.env.REMEDIATE_ENABLED === "true", consent: row.remediate,
      installationId: row.installation_id, commitSha: row.commit_sha,
      openSignatures: open.rows.map((item) => item.signature),
    }, {
      progress: (stage, files) => recordStage(id, stage, files),
      draft: async () => {
        if (!builderUrl) return { status: "off", reason: "BUILDER_URL 이 없다" };
        const app = githubAppConfig();
        if (!app.ready || !app.privateKey || !row.installation_id)
          return { status: "rejected", reason: "GitHub App 설치가 없다" };
        const token = await createInstallationToken(signAppJwt(app.id, app.privateKey), row.installation_id, boundedFetch);
        const response = await fetch(`${builderUrl}/api/remediate/drafts`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: `https://github.com/${row.repo}`, token,
            commit: row.commit_sha, log, files: incident.files }),
          signal: AbortSignal.any([deadline, AbortSignal.timeout(90000)]),
        });
        if (!response.ok) throw new Error("builder");
        const body = draftSchema.safeParse(await response.json());
        if (!body.success) return { status: "rejected", reason: "diff 응답 형식 오류" };
        if (body.data.status === "draft") {
          if (Object.keys(body.data.files).length > 3)
            return { status: "rejected", reason: "diff 파일 제한 초과" };
          return body.data;
        }
        return { status: body.data.status, reason: body.data.reason ?? "diff를 만들지 못했다" };
      },
      openPull: async (files) => {
        failure = "github-unavailable";
        const app = githubAppConfig();
        if (!app.ready || !app.privateKey || !row.installation_id || !row.commit_sha)
          throw new Error("github");
        const token = await createInstallationToken(signAppJwt(app.id, app.privateKey), row.installation_id, boundedFetch);
        return openFixPullRequest({
          token, repo: row.repo, base: row.branch ?? "main", commit: row.commit_sha,
          branch: `lily/fix-${id}`, title: "fix: Lily AI runtime repair",
          body: `${log}\n\nAI가 생성한 수정 PR입니다. 변경 내용을 검토한 뒤 적용해 주세요.`,
          files: Object.entries(files).map(([path, content]) => ({ path, content })),
        }, boundedFetch);
      },
    });
    await finishRun(id, result.status === "opened" ? "review" : "skipped",
      result.status === "opened" ? null : reasonCode(result.reason), result.url ?? null);
    if (result.status !== "off") {
      await db.query(
        `INSERT INTO remediation_prs(id,project_id,app_name,signature,commit_sha,status,reason,pr_url)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [id, row.id, incident.app, incident.signature, row.commit_sha ?? "",
          result.status === "opened" ? "opened" : "rejected", reasonCode(result.reason), result.url ?? null],
      );
    }
  } catch {
    await finishRun(id, "failed", failure);
  }
}
