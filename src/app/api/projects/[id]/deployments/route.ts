import {
  apiError,
  json,
  limitWrites,
  readJson,
  requireUser,
  ApiError,
} from "@/lib/api";
import { createDeployment, listDeployments } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json({
      items: await listDeployments(
        user.id,
        validate(idSchema, (await context.params).id),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "deployments", 10);
    const key = request.headers.get("idempotency-key");
    if (!key || key.length > 128)
      throw new ApiError(
        400,
        "IDEMPOTENCY_KEY",
        "Idempotency-Key 헤더가 필요합니다.",
      );
    validate(z.object({}).strict(), await readJson(request));
    return json(
      await createDeployment(
        user.id,
        validate(idSchema, (await context.params).id),
        key,
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
