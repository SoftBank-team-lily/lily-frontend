import { ApiError, apiError, json } from "@/lib/api";
import { WebhookRejected, handleWebhook } from "@/lib/github/webhook";
import { createDeployment, projectsForWebhook } from "@/lib/projects/server";

export const runtime = "nodejs";

const MAX_BODY = 2_000_000;

async function readBody(request: Request) {
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("application/json"))
    throw new ApiError(415, "CONTENT_TYPE", "JSON 형식으로 요청해 주세요.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new WebhookRejected(400, "INVALID_BODY", "웹훅 본문을 읽지 못했어요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw new ApiError(413, "BODY_TOO_LARGE", "웹훅 본문이 너무 커요.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const result = await handleWebhook({
      event: request.headers.get("x-github-event"),
      signature: request.headers.get("x-hub-signature-256"),
      body,
      findProjects: projectsForWebhook,
      deploy: async (ownerId, projectId, sha) => {
        await createDeployment(ownerId, projectId, sha);
      },
    });
    return json(result.body, result.status);
  } catch (error) {
    if (error instanceof WebhookRejected)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    return apiError(error);
  }
}
