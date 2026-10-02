import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { cancelHomeMove } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 진행 중인 거점 전환을 멈춘다. 공개 주소를 바꾸기 전이면 출발 거점으로 되돌아간다 (진행은 burst.live 로 본다)
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    const id = validate(idSchema, (await context.params).id);
    return json(await cancelHomeMove(user.id, id), 202);
  } catch (error) {
    return apiError(error);
  }
}
