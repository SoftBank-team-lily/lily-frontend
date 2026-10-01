import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { getProject, updateProject } from "@/lib/projects/server";
import { idSchema, updateSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json(
      await getProject(user.id, validate(idSchema, (await context.params).id)),
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
