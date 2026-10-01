import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { getAgent, issueAgent } from "@/lib/agents/server";

// 온프레미스 연결. GET: 연결 상태, POST: 에이전트 실행에 넣을 새 토큰 (응답에서 한 번만 보인다)
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ agent: await getAgent(user.id) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "agents", 5);
    return json(await issueAgent(user.id), 201);
  } catch (error) {
    return apiError(error);
  }
}
