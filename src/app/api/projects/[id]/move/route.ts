import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { moveToCloud, moveToOnPrem } from "@/lib/projects/server";
import { idSchema, moveSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 클라우드 앱을 내 PC 로 옮기거나(to: onprem) 되돌린다(to: cloud). 공개 주소는 클라우드 주소 그대로다.
// onprem 은 옮기는 배포를 만들고 바로 돌아온다 (실행기가 진행한다). cloud 는 클러스터 앱이 뜰 때까지 기다린다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    const id = validate(idSchema, (await context.params).id);
    const input = validate(moveSchema, await readJson(request));
    return json(
      input.to === "onprem"
        ? await moveToOnPrem(user.id, id, input.database ?? null)
        : await moveToCloud(user.id, id),
    );
  } catch (error) {
    return apiError(error);
  }
}
