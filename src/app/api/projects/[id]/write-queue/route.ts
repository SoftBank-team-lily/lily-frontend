import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { getWriteQueue, updateWriteQueue } from "@/lib/projects/server";
import { idSchema, validate, writeQueueSchema } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 온프레미스 앱의 엣지 쓰기 큐: 등록 경로, 상태별 건수, 최근 요청
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json(await getWriteQueue(user.id, validate(idSchema, (await context.params).id)));
  } catch (error) {
    return apiError(error);
  }
}
// 등록 경로를 바꾼다. 빈 목록이면 끈다
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "write-queue", 20);
    const input = validate(writeQueueSchema, await readJson(request));
    return json(await updateWriteQueue(user.id, validate(idSchema, (await context.params).id), input));
  } catch (error) {
    return apiError(error);
  }
}
