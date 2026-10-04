import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { getTraffic, updateTraffic } from "@/lib/projects/server";
import { idSchema, trafficSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 멀티클라우드(AWS + GCP) 프로젝트의 클라우드별 비율. 화면이 몇 초마다 보고, 슬라이더를 놓을 때 바꾼다
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(request);
    return json(await getTraffic(user.id, validate(idSchema, (await context.params).id)));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "traffic", 30);
    const input = validate(trafficSchema, await readJson(request));
    return json(await updateTraffic(user.id, validate(idSchema, (await context.params).id), input.gcpPercent));
  } catch (error) {
    return apiError(error);
  }
}
