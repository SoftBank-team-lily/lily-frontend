import "server-only";
import type { AppCandidate, ConfigAdvice, Detection, DatabaseChoice } from "./types";
import { reusableKeys } from "./server";

const NONE: Detection = { database: "none", dir: null, apps: [], config: [], problem: null };

/**
 * lily-builder POST /api/detect 로 레포가 쓰는 DB, 앱 폴더 후보, 기동에 필요한 설정 키를 본다.
 * builder·GitHub 에 닿지 못하면 DB 없음과 빈 목록 (화면에서 사용자가 고친다).
 * 설정 키는 같은 레포의 다른 프로젝트에 값이 있으면 reusable 로 표시한다 (값은 보내지 않는다).
 */
export async function detectRepo(
  ownerId: string,
  repo: string,
  branch?: string,
  rootDir?: string,
): Promise<Detection> {
  const builderUrl = process.env.BUILDER_URL?.replace(/\/+$/, "");
  if (!builderUrl) return NONE;
  try {
    const response = await fetch(`${builderUrl}/api/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        repoUrl: `https://github.com/${repo}`,
        ...(branch ? { branch } : {}),
        ...(rootDir ? { rootDir } : {}),
      }),
      // 소스를 훑고 AI 판단까지 받는다
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) return NONE;
    const found = (await response.json()) as {
      database: string | null;
      dir: string | null;
      apps?: AppCandidate[];
      config?: ConfigAdvice[];
      problem?: string | null;
    };
    const config = found.config ?? [];
    const reusable = await reusableKeys(ownerId, repo, config.map((key) => key.env));
    const database: DatabaseChoice =
      found.database === "postgres" || found.database === "mysql" ? found.database : "none";
    return {
      database,
      dir: found.dir ?? null,
      apps: found.apps ?? [],
      config: config.map((key) => ({ ...key, reusable: reusable.has(key.env) })),
      problem: found.problem ?? null,
    };
  } catch {
    return NONE;
  }
}
