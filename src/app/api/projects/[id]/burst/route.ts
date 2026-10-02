import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { updateBurst } from "@/lib/projects/server";
import { burstSchema, idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 온프레미스 앱의 클라우드 버스팅 켜기·끄기와 클라우드 비율. 슬라이더를 놓을 때마다 온다
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "burst", 30);
    const input = validate(burstSchema, await readJson(request));
    return json(await updateBurst(user.id, validate(idSchema, (await context.params).id), input));
  } catch (error) {
    return apiError(error);
  }
}
