import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { fixProject } from "@/lib/projects/server";
import { fixSchema, idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
// 실패한 배포 고치기: 진단이 알려 준 환경변수·포트·폴더를 넣고 (redeploy 면) 바로 다시 배포한다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "deployments", 10);
    const { redeploy, ...input } = validate(fixSchema, await readJson(request));
    return json(
      await fixProject(
        user.id,
        validate(idSchema, (await context.params).id),
        input,
        redeploy ?? true,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
