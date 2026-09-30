import { createHash, timingSafeEqual } from "node:crypto";
import { apiError, json, readJson, ApiError } from "@/lib/api";
import { recordEvent } from "@/lib/projects/server";
import { eventSchema, idSchema, validate } from "@/lib/projects/schema";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const expected = process.env.DEPLOYMENT_API_KEY;
    if (!expected || expected.length < 32 || expected.startsWith("replace-"))
      throw new ApiError(
        503,
        "NOT_CONFIGURED",
        "배포 실행기 연결을 설정해 주세요.",
      );
    const supplied = request.headers.get("authorization") ?? "";
    const digest = (value: string) =>
      createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(supplied), digest(`Bearer ${expected}`)))
      throw new ApiError(401, "UNAUTHORIZED", "실행기 인증이 필요합니다.");
    const input = validate(eventSchema, await readJson(request));
    return json(
      await recordEvent(
        validate(idSchema, (await params).id),
        input.eventId,
        input.status,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
