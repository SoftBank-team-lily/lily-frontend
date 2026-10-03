import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { githubAppConfig, signAppJwt } from "./app";
import {
  createInstallationToken,
  fetchInstallation,
  listInstallationRepos,
} from "./github-api";
import type { InstallationChange } from "./webhook";

export function installUrl(slug: string, state: string) {
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
}

function requireConfig() {
  const config = githubAppConfig();
  if (!config.ready || !config.privateKey)
    throw new ApiError(
      503,
      "GITHUB_APP_UNCONFIGURED",
      "GitHub App이 아직 설정되지 않았어요.",
    );
  return { ...config, privateKey: config.privateKey };
}

export async function beginInstall(ownerId: string) {
  const config = requireConfig();
  const state = randomBytes(16).toString("hex");
  await db.query("DELETE FROM github_install_states WHERE expires_at < now()");
  await db.query(
    "INSERT INTO github_install_states(state, owner_id, expires_at) VALUES ($1,$2, now() + interval '10 minutes')",
    [state, ownerId],
  );
  return installUrl(config.slug, state);
}

async function linkRepos(ownerId: string, installationId: string, repos: string[]) {
  if (repos.length === 0) return;
  await db.query(
    `UPDATE projects SET github_installation_id=$1
     WHERE owner_id=$2 AND repo = ANY($3::text[])
     AND (github_installation_id IS NULL OR github_installation_id=$1)`,
    [installationId, ownerId, repos],
  );
}

export async function completeInstall(
  ownerId: string,
  state: string,
  installationId: string,
) {
  if (!/^[1-9][0-9]{0,18}$/.test(installationId))
    throw new ApiError(
      400,
      "INVALID_INSTALLATION",
      "GitHub 설치를 확인하지 못했어요.",
    );
  const consumed = await db.query<{ owner_id: string }>(
    "DELETE FROM github_install_states WHERE state=$1 AND expires_at > now() RETURNING owner_id",
    [state],
  );
  if (consumed.rows[0]?.owner_id !== ownerId)
    throw new ApiError(
      403,
      "INVALID_STATE",
      "GitHub 연결을 확인하지 못했어요. 계정 화면에서 다시 연결해 주세요.",
    );
  const config = requireConfig();
  let accountLogin: string;
  let repos: string[];
  try {
    const jwt = signAppJwt(config.id, config.privateKey);
    accountLogin = (await fetchInstallation(jwt, installationId)).accountLogin;
    const token = await createInstallationToken(jwt, installationId);
    repos = await listInstallationRepos(token);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "GITHUB_UNAVAILABLE",
      "GitHub 저장소 목록을 읽지 못했어요.",
    );
  }
  const existing = await db.query<{ owner_id: string }>(
    "SELECT owner_id FROM github_installations WHERE installation_id=$1",
    [installationId],
  );
  if (existing.rows[0] && existing.rows[0].owner_id !== ownerId)
    throw new ApiError(
      409,
      "INSTALLATION_TAKEN",
      "이 GitHub 설치는 다른 Lily 계정에 연결되어 있어요.",
    );
  const saved = await db.query(
    `INSERT INTO github_installations(installation_id, owner_id, account_login)
     VALUES ($1,$2,$3)
     ON CONFLICT (installation_id) DO UPDATE SET account_login=EXCLUDED.account_login
     WHERE github_installations.owner_id=EXCLUDED.owner_id
     RETURNING installation_id`,
    [installationId, ownerId, accountLogin],
  );
  if (!saved.rows[0])
    throw new ApiError(
      409,
      "INSTALLATION_TAKEN",
      "이 GitHub 설치는 다른 Lily 계정에 연결되어 있어요.",
    );
  await linkRepos(ownerId, installationId, repos);
}

/** 설치 뒤에 만든 프로젝트도, 그 설치가 저장소를 보면 연결한다 */
export async function attachProjectIfInstalled(
  ownerId: string,
  projectId: string,
  repo: string,
) {
  const config = githubAppConfig();
  if (!config.ready || !config.privateKey) return;
  const installations = await db.query<{ installation_id: string }>(
    "SELECT installation_id::text AS installation_id FROM github_installations WHERE owner_id=$1",
    [ownerId],
  );
  if (installations.rows.length === 0) return;
  const jwt = signAppJwt(config.id, config.privateKey);
  for (const row of installations.rows) {
    try {
      const token = await createInstallationToken(jwt, row.installation_id);
      const repos = await listInstallationRepos(token);
      if (!repos.includes(repo)) continue;
      await db.query(
        `UPDATE projects SET github_installation_id=$1
         WHERE id=$2 AND owner_id=$3
         AND (github_installation_id IS NULL OR github_installation_id=$1)`,
        [row.installation_id, projectId, ownerId],
      );
      return;
    } catch {
      console.error("GitHub 설치의 저장소 목록을 읽지 못했습니다.");
    }
  }
}

export async function applyInstallationChange(change: InstallationChange) {
  if (change.type === "deleted") {
    await db.query(
      "UPDATE projects SET github_installation_id=NULL WHERE github_installation_id=$1",
      [change.installationId],
    );
    await db.query("DELETE FROM github_installations WHERE installation_id=$1", [
      change.installationId,
    ]);
    return;
  }
  if (change.type === "repos-removed") {
    await db.query(
      `UPDATE projects SET github_installation_id=NULL
       WHERE github_installation_id=$1 AND repo = ANY($2::text[])`,
      [change.installationId, change.repos],
    );
    return;
  }
  const owner = await db.query<{ owner_id: string }>(
    "SELECT owner_id FROM github_installations WHERE installation_id=$1",
    [change.installationId],
  );
  if (!owner.rows[0]) return;
  await linkRepos(owner.rows[0].owner_id, change.installationId, change.repos);
}
