import { apiError, json, requireUser } from "@/lib/api";
import { getProjectEntry } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    return json(
      await getProjectEntry(user.id, validate(idSchema, (await params).id)),
    );
  } catch (error) {
    return apiError(error);
  }
}
