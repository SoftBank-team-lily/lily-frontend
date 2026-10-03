import { apiError, json, requireUser } from "@/lib/api";
import { getSchema } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 클라우드 앱의 스키마 이력(pgroll·Flyway)과 열린 pgroll 롤백 창
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json(await getSchema(user.id, validate(idSchema, (await context.params).id)));
  } catch (error) {
    return apiError(error);
  }
}
