import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { startHomeMove } from "@/lib/projects/server";
import { homeSchema, idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 공개 주소의 거점을 옮긴다 (내 PC ↔ 클라우드). 시작만 하고, 진행은 프로젝트의 burst.live.home 으로 본다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    const { home } = validate(homeSchema, await readJson(request));
    return json(await startHomeMove(user.id, validate(idSchema, (await context.params).id), home), 202);
  } catch (error) {
    return apiError(error);
  }
}
