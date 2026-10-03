import { apiError, json, limitWrites, requireUser } from "@/lib/api";
import { cancelDeployment } from "@/lib/projects/server";
import { idSchema, validate } from "@/lib/projects/schema";

type Context = { params: Promise<{ id: string; deploymentId: string }> };
export const runtime = "nodejs";
// 진행 중인 배포를 멈춘다. 클라우드는 lily-cicd 로 넘기기 전, 내 PC 는 트래픽을 새 버전으로 바꾸기 전까지 된다
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "deployments", 10);
    const params = await context.params;
    return json(
      await cancelDeployment(
        user.id,
        validate(idSchema, params.id),
        validate(idSchema, params.deploymentId),
      ),
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
