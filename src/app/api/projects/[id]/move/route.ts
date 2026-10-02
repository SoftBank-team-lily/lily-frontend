import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { moveToOnPrem } from "@/lib/projects/server";
import { idSchema, moveSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 클라우드 앱을 내 PC 로 옮긴다. 공개 주소는 그대로이고 CNAME 내용물만 내 PC 터널로 바뀐다.
// 옮기는 배포를 만들고 바로 돌아온다 (실행기가 진행한다). 다시 클라우드로는 거점 전환(/home)으로 간다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    const id = validate(idSchema, (await context.params).id);
    const input = validate(moveSchema, await readJson(request));
    return json(await moveToOnPrem(user.id, id, input.database ?? null));
  } catch (error) {
    return apiError(error);
  }
}
