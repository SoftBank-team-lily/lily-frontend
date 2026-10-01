import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { setRunning } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 앱을 내린다 (모든 슬롯 0). Service·Ingress·DB 는 남아서 start 로 바로 되살린다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    return json(
      await setRunning(user.id, validate(idSchema, (await context.params).id), false),
    );
  } catch (error) {
    return apiError(error);
  }
}
