import "server-only";
import type { DatabaseChoice } from "./types";

/**
 * lily-builder POST /api/detect 로 레포가 쓰는 DB 를 본다.
 * 감지하지 못했거나 builder·GitHub 에 닿지 못하면 none (화면에서 사용자가 고친다).
 */
export async function detectDatabase(
  repo: string,
  branch?: string,
  rootDir?: string,
): Promise<DatabaseChoice> {
  const builderUrl = process.env.BUILDER_URL?.replace(/\/+$/, "");
  if (!builderUrl) return "none";
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
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return "none";
    const { database } = (await response.json()) as { database: string | null };
    return database === "postgres" || database === "mysql" ? database : "none";
  } catch {
    return "none";
  }
}
