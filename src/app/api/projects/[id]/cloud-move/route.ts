import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { finishCloudMove, getCloudMove, startCloudMove } from "@/lib/projects/server";
import { cloudMoveSchema, idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 클라우드 전용 앱을 다른 클라우드로 옮기기 (AWS ↔ GCP, DB 는 RDS ↔ Cloud SQL). 진행은 GET 으로 본다
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json(await getCloudMove(user.id, validate(idSchema, (await context.params).id)));
  } catch (error) {
    return apiError(error);
  }
}

// start: 옮기기 시작. rollback: 원본으로 되돌리기 (옮긴 뒤 쓴 데이터는 버린다). finalize: 원본 정리
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    const id = validate(idSchema, (await context.params).id);
    const input = validate(cloudMoveSchema, await readJson(request));
    return json(
      input.action === "start"
        ? await startCloudMove(user.id, id, input.to)
        : await finishCloudMove(user.id, id, input.action),
    );
  } catch (error) {
    return apiError(error);
  }
}
