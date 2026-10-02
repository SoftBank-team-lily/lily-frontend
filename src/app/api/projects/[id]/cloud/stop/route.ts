import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { stopIdleCloud } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 온프레미스 앱의 쓰이지 않는 클라우드 Pod 를 내린다 (공개 주소가 내 PC 이고 버스팅이 꺼져 있을 때)
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    return json(await stopIdleCloud(user.id, validate(idSchema, (await context.params).id)));
  } catch (error) {
    return apiError(error);
  }
}
