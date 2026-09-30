import "server-only";
import { getUser } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/limits";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return json(
      { error: { code: "ALREADY_EXISTS", message: "이미 등록된 항목입니다." } },
      409,
    );
  }
  console.error("API 요청을 처리하지 못했습니다.");
  return json(
    {
      error: {
        code: "SERVER_ERROR",
        message: "서버에서 요청을 처리하지 못했어요.",
      },
    },
    500,
  );
}
export async function requireUser(request: Request, mutation = false) {
  if (mutation) {
    const allowed = [
      process.env.BETTER_AUTH_URL,
      ...(process.env.AUTH_TRUSTED_ORIGINS ?? "").split(","),
    ]
      .filter(Boolean)
      .map((value) => new URL(value!.trim()).origin);
    if (
      !allowed.includes(request.headers.get("origin") ?? "") ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new ApiError(403, "INVALID_ORIGIN", "허용되지 않은 요청입니다.");
    }
  }
  const user = await getUser(request.headers);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요해요.");
  if (!user.emailVerified)
    throw new ApiError(403, "UNVERIFIED", "이메일 인증이 필요해요.");
  return user;
}
export async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ApiError(415, "CONTENT_TYPE", "JSON 형식으로 요청해 주세요.");
  }
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError(400, "INVALID_BODY", "입력 내용을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        throw new ApiError(413, "BODY_TOO_LARGE", "요청 내용이 너무 커요.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_BODY", "입력 내용을 확인해 주세요.");
  }
}
export async function limitWrites(userId: string, action: string, max = 20) {
  const limit = await consumeLimit(`${action}:${userId}`, { window: 60, max });
  if (!limit.allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "요청이 많아요. 잠시 후 다시 시도해 주세요.",
    );
}
