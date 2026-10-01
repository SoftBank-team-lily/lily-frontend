import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { AgentIssued, AgentState } from "./types";

// 내 PC(온프레미스 에이전트). 토큰 발급과 연결 상태는 lily-builder 가 맡는다 (/api/agents).
// 여기서는 사용자 ↔ 에이전트 key 만 보관한다. 토큰은 저장하지 않는다.

function builderUrl() {
  const url = process.env.BUILDER_URL;
  if (!url)
    throw new ApiError(503, "NOT_CONFIGURED", "배포 서버 연결을 설정해 주세요.");
  return url.replace(/\/+$/, "");
}

export async function agentKey(ownerId: string): Promise<string | null> {
  const result = await db.query<{ agent_key: string }>(
    "SELECT agent_key FROM agents WHERE owner_id=$1",
    [ownerId],
  );
  return result.rows[0]?.agent_key ?? null;
}

export async function getAgent(ownerId: string): Promise<AgentState> {
  const key = await agentKey(ownerId);
  if (!key) return null;
  const response = await fetch(`${builderUrl()}/api/agents/${key}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!response?.ok)
    throw new ApiError(502, "BUILDER_UNAVAILABLE", "배포 서버에 연결하지 못했어요.");
  const status = (await response.json()) as {
    connected: boolean;
    agentId: string | null;
    database: boolean;
  };
  return {
    connected: status.connected,
    agentId: status.agentId,
    database: status.database,
  };
}

/** 새 토큰을 받아 이 사용자의 에이전트로 둔다. 이전 토큰으로 붙은 에이전트는 이 계정에서 쓰이지 않는다 */
export async function issueAgent(ownerId: string): Promise<AgentIssued> {
  const response = await fetch(`${builderUrl()}/api/agents`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!response?.ok)
    throw new ApiError(502, "BUILDER_UNAVAILABLE", "배포 서버에 연결하지 못했어요.");
  const issued = (await response.json()) as { key: string; token: string };
  await db.query(
    `INSERT INTO agents(owner_id, agent_key) VALUES ($1,$2)
    ON CONFLICT (owner_id) DO UPDATE SET agent_key=EXCLUDED.agent_key, created_at=now()`,
    [ownerId, issued.key],
  );
  return { token: issued.token };
}
