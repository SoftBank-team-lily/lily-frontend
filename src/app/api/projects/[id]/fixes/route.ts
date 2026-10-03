import { apiError, json, requireUser } from "@/lib/api";
import { idSchema, validate } from "@/lib/projects/schema";
import { getFixProgress } from "@/lib/remediate/progress";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const id = validate(idSchema, (await context.params).id);
    return json(await getFixProgress(user.id, id));
  } catch (error) {
    return apiError(error);
  }
}
