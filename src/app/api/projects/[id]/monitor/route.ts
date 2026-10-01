import { apiError, json, requireUser } from "@/lib/api";
import { idSchema, validate } from "@/lib/projects/schema";
import { monitorQuery } from "@/lib/monitor/schema";
import { getMonitor } from "@/lib/monitor/server";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const id = validate(idSchema, (await context.params).id);
    const query = validate(monitorQuery, Object.fromEntries(new URL(request.url).searchParams));
    return json(await getMonitor(user.id, id, query));
  } catch (error) {
    return apiError(error);
  }
}
