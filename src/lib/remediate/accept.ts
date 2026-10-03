import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { githubAppConfig, signAppJwt } from "@/lib/github/app";
import { createInstallationToken } from "@/lib/github/github-api";
import { branchName, remediate, type Incident } from "@/lib/remediate/flow";
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

function incidentOf(body: unknown): Incident {
  if (!body || typeof body !== "object") throw new ApiError(400, "BAD_REQUEST", "사건이 없습니다.");
  const raw = body as { app?: unknown; signature?: unknown; log?: unknown; files?: unknown };
  if (typeof raw.app !== "string" || typeof raw.signature !== "string" || typeof raw.log !== "string") {
    throw new ApiError(400, "BAD_REQUEST", "사건이 없습니다.");
  }
  const files = Array.isArray(raw.files) ? raw.files.filter((file): file is string => typeof file === "string") : [];
  return { app: raw.app, signature: raw.signature, log: raw.log, files };
}

/**
 * 마스터 스위치가 켜진 뒤에만 호출된다. 프로젝트 동의가 꺼져 있으면 PR 을 열지 않는다.
 */
export async function acceptIncident(request: Request) {
  authorized(request);
  const incident = incidentOf(await request.json());
  const found = await db.query<{
    id: string;
    repo: string;
    branch: string | null;
    remediate: boolean;
    installation_id: string | null;
    commit_sha: string | null;
  }>(
    `SELECT p.id, p.repo, p.branch, p.remediate,
            p.github_installation_id::text AS installation_id, r.commit_sha
     FROM builder_runs r
     JOIN deployments d ON d.id = r.deployment_id
     JOIN projects p ON p.id = d.project_id
     WHERE r.app_name = $1 AND d.status = 'succeeded'
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [incident.app],
  );
  const row = found.rows[0];
  if (!row) return { status: "rejected" as const, reason: "배포된 프로젝트가 없다" };

  const open = await db.query<{ signature: string }>(
    `SELECT signature FROM remediation_prs WHERE project_id = $1 AND status = 'opened'`,
    [row.id],
  );
  const builderUrl = process.env.BUILDER_URL?.replace(/\/$/, "") ?? "";
  const result = await remediate(
    incident,
    {
      enabled: true,
      consent: row.remediate,
      installationId: row.installation_id,
      commitSha: row.commit_sha,
      openSignatures: open.rows.map((item) => item.signature),
    },
    {
      draft: async () => {
        if (!builderUrl) return { status: "off", reason: "BUILDER_URL 이 없다" };
        const app = githubAppConfig();
        if (!app.ready || !app.privateKey || !row.installation_id) {
          return { status: "rejected", reason: "GitHub App 설치가 없다" };
        }
        const token = await createInstallationToken(signAppJwt(app.id, app.privateKey), row.installation_id);
        const response = await fetch(`${builderUrl}/api/remediate/drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: `https://github.com/${row.repo}`,
            token,
            commit: row.commit_sha,
            log: incident.log,
            files: incident.files,
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) return { status: "rejected", reason: "diff 초안을 받지 못했다" };
        const body = (await response.json()) as {
          status?: string;
          reason?: string;
          files?: Record<string, string>;
        };
        if (body.status === "draft" && body.files) return { status: "draft", files: body.files };
        if (body.status === "off") return { status: "off", reason: body.reason ?? "초안이 꺼져 있다" };
        return { status: "rejected", reason: body.reason ?? "diff를 만들지 못했다" };
      },
      openPull: async (files) => {
        const app = githubAppConfig();
        if (!app.ready || !app.privateKey || !row.installation_id || !row.commit_sha) {
          throw new ApiError(503, "NOT_CONFIGURED", "GitHub App 이 없습니다.");
        }
        const token = await createInstallationToken(signAppJwt(app.id, app.privateKey), row.installation_id);
        return openFixPullRequest({
          token,
          repo: row.repo,
          base: row.branch ?? "main",
          commit: row.commit_sha,
          branch: branchName(incident.signature),
          title: incident.signature,
          body: [
            incident.log,
            "",
            "이 PR은 로그 사고로 연 초안이다. 자동으로 머지하지 않는다.",
          ].join("\n"),
          files: Object.entries(files).map(([path, content]) => ({ path, content })),
        });
      },
    },
  );

  if (result.status !== "off") {
    await db.query(
      `INSERT INTO remediation_prs(id, project_id, app_name, signature, commit_sha, status, reason, pr_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        row.id,
        incident.app,
        incident.signature,
        row.commit_sha ?? "",
        result.status === "opened" ? "opened" : "rejected",
        result.reason || null,
        result.url ?? null,
      ],
    );
  }
  return result;
}
