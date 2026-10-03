import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { closeSchemaWindow } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// pgroll 롤백 창을 바로 닫는다 (complete). 이후에는 스키마를 되돌릴 수 없다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    return json(await closeSchemaWindow(user.id, validate(idSchema, (await context.params).id)));
  } catch (error) {
    return apiError(error);
  }
}
