import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { setRunning } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 내린 앱을 기본 레플리카로 다시 띄운다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    return json(
      await setRunning(user.id, validate(idSchema, (await context.params).id), true),
    );
  } catch (error) {
    return apiError(error);
  }
}
