import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { moveHome, readHome } from "@/lib/home/server";
import { idSchema, validate } from "@/lib/projects/schema";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const maxDuration = 180;

const bodySchema = z.object({ home: z.enum(["cloud", "onprem"]) }).strict();

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    const id = validate(idSchema, (await context.params).id);
    return json(await readHome(user.id, id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "home", 5);
    const id = validate(idSchema, (await context.params).id);
    const body = validate(bodySchema, await readJson(request));
    return json(await moveHome(user.id, id, body.home));
  } catch (error) {
    return apiError(error);
  }
}
