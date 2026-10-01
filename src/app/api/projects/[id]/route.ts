import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { deleteProject, getProject, updateProject } from "@/lib/projects/server";
import { idSchema, updateSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json(
      await getProject(user.id, validate(idSchema, (await context.params).id), true),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "projects");
    const input = validate(updateSchema, await readJson(request));
    return json(
      await updateProject(
        user.id,
        validate(idSchema, (await context.params).id),
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
// 프로젝트 삭제. 클라우드 앱은 클러스터에서 지우고, ?database=true 면 앱 DB 도 지운다 (되돌릴 수 없다)
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "apps", 10);
    const database = new URL(request.url).searchParams.get("database") === "true";
    return json(
      await deleteProject(
        user.id,
        validate(idSchema, (await context.params).id),
        database,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
