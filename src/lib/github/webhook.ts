import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** GitHub 웹훅 Secret. 계정 화면에서 저장소 설정에 붙여 넣는다. */
export function createWebhookSecret() {
  return randomBytes(32).toString("hex");
}

export class WebhookRejected extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type WebhookProject = {
  id: string;
  ownerId: string;
  /** null 이면 main. lily-builder 가 브랜치를 비울 때 main 을 쓰는 것과 같다 */
  branch: string | null;
  secret: string | null;
  /** GitHub App 설치 id. 있으면 저장소 웹훅이 아니라 앱 이벤트만 배포한다 */
  installationId: string | null;
};

export type InstallationChange =
  | { type: "deleted"; installationId: string }
  | { type: "repos-removed"; installationId: string; repos: string[] }
  | { type: "repos-added"; installationId: string; repos: string[] };

const REPO_NAME = /^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/;
const BRANCH_NAME = /^[\w./-]{1,200}$/;

function signaturesMatch(body: Buffer, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const given = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(given, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(expected, actual);
}

function readRepo(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const name = (payload as { repository?: { full_name?: unknown } }).repository
    ?.full_name;
  if (typeof name !== "string") return null;
  const repo = name.trim().toLowerCase();
  return REPO_NAME.test(repo) ? repo : null;
}

/** push 가 가리키는 브랜치와 커밋. 태그, 삭제, 커밋이 없는 푸시는 배포하지 않는다 */
function readPush(payload: object) {
  const body = payload as { deleted?: unknown; ref?: unknown; after?: unknown };
  if (body.deleted === true) return null;
  if (typeof body.ref !== "string" || !body.ref.startsWith("refs/heads/"))
    return null;
  const branch = body.ref.slice("refs/heads/".length);
  if (!BRANCH_NAME.test(branch)) return null;
  if (typeof body.after !== "string" || !/^[0-9a-f]{40}$/.test(body.after))
    return null;
  if (/^0+$/.test(body.after)) return null;
  return { branch, sha: body.after };
}

function readInstallationId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { installation?: { id?: unknown } }).installation?.id;
  if (typeof id === "number" && Number.isSafeInteger(id) && id > 0)
    return String(id);
  if (typeof id === "string" && /^[1-9][0-9]{0,18}$/.test(id)) return id;
  return null;
}

function readAction(payload: object) {
  const action = (payload as { action?: unknown }).action;
  return typeof action === "string" ? action : "";
}

function readRepoList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    const name =
      item && typeof item === "object"
        ? (item as { full_name?: unknown }).full_name
        : null;
    if (typeof name !== "string") continue;
    const repo = name.trim().toLowerCase();
    if (REPO_NAME.test(repo)) names.push(repo);
  }
  return names;
}

/**
 * GitHub 웹훅 본문을 배포 기록으로 바꾼다.
 * 서명이 맞는 프로젝트만 배포하고, 같은 커밋은 request_key 로 한 번만 쌓인다.
 * installation.id 가 있으면 앱 시크릿만 인정한다. 프로젝트 시크릿으로는 통과시키지 않는다.
 */
export async function handleWebhook(input: {
  event: string | null;
  signature: string | null;
  body: Buffer;
  appSecret?: string | null;
  findProjects: (repo: string) => Promise<WebhookProject[]>;
  deploy: (ownerId: string, projectId: string, sha: string) => Promise<void>;
  onInstallation?: (change: InstallationChange) => Promise<void>;
}): Promise<{ status: 200; body: { deployed: number } | { ok: true } }> {
  let payload: unknown;
  try {
    payload = JSON.parse(input.body.toString("utf8"));
  } catch {
    throw new WebhookRejected(400, "INVALID_BODY", "웹훅 본문을 읽지 못했어요.");
  }
  const installationId = readInstallationId(payload);
  if (installationId) {
    if (
      !input.appSecret ||
      !signaturesMatch(input.body, input.signature, input.appSecret)
    )
      throw new WebhookRejected(
        401,
        "INVALID_SIGNATURE",
        "웹훅 서명이 올바르지 않아요.",
      );
    if (input.event === "ping") return { status: 200, body: { ok: true } };
    if (payload && typeof payload === "object") {
      if (input.event === "installation" && readAction(payload) === "deleted")
        await input.onInstallation?.({ type: "deleted", installationId });
      if (input.event === "installation_repositories") {
        const action = readAction(payload);
        const body = payload as {
          repositories_removed?: unknown;
          repositories_added?: unknown;
        };
        if (action === "removed") {
          const repos = readRepoList(body.repositories_removed);
          if (repos.length > 0)
            await input.onInstallation?.({
              type: "repos-removed",
              installationId,
              repos,
            });
        } else if (action === "added") {
          const repos = readRepoList(body.repositories_added);
          if (repos.length > 0)
            await input.onInstallation?.({
              type: "repos-added",
              installationId,
              repos,
            });
        }
      }
      if (
        input.event === "installation" ||
        input.event === "installation_repositories"
      )
        return { status: 200, body: { ok: true } };
    }
    if (input.event !== "push") return { status: 200, body: { deployed: 0 } };
    const repo = readRepo(payload);
    if (!repo || !payload || typeof payload !== "object")
      return { status: 200, body: { deployed: 0 } };
    const push = readPush(payload);
    if (!push) return { status: 200, body: { deployed: 0 } };
    const projects = await input.findProjects(repo);
    const targets = projects.filter(
      (project) =>
        project.installationId === installationId &&
        (project.branch || "main") === push.branch,
    );
    for (const project of targets)
      await input.deploy(project.ownerId, project.id, push.sha);
    return { status: 200, body: { deployed: targets.length } };
  }
  const repo = readRepo(payload);
  if (!repo) return { status: 200, body: { deployed: 0 } };
  const projects = await input.findProjects(repo);
  if (projects.length === 0) return { status: 200, body: { deployed: 0 } };
  const matched = projects.filter(
    (project) =>
      project.secret !== null &&
      signaturesMatch(input.body, input.signature, project.secret),
  );
  if (matched.length === 0)
    throw new WebhookRejected(
      401,
      "INVALID_SIGNATURE",
      "웹훅 서명이 올바르지 않아요.",
    );
  if (input.event === "ping") return { status: 200, body: { ok: true } };
  if (input.event !== "push" || !payload || typeof payload !== "object")
    return { status: 200, body: { deployed: 0 } };
  const push = readPush(payload);
  if (!push) return { status: 200, body: { deployed: 0 } };
  const targets = matched.filter(
    (project) =>
      project.installationId === null &&
      (project.branch || "main") === push.branch,
  );
  for (const project of targets)
    await input.deploy(project.ownerId, project.id, push.sha);
  return { status: 200, body: { deployed: targets.length } };
}
