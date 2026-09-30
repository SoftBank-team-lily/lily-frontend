import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";
import { ApiError, assertOrigin, readJson } from "@/lib/api";
import { consumeLimit } from "@/lib/limits";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  try {
    const path = new URL(request.url).pathname.slice("/api/auth".length);
    const limits: Record<string, number> = {
      "/sign-in/email": 10,
      "/sign-up/email": 5,
      "/request-password-reset": 3,
      "/send-verification-email": 3,
    };
    let forwarded = request;
    let input: unknown;
    if (limits[path]) assertOrigin(request);
    if (
      limits[path] ||
      (request.body &&
        request.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json"))
    ) {
      input = await readJson(request);
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      forwarded = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(input),
      });
    }
    if (limits[path]) {
      if (
        input &&
        typeof input === "object" &&
        "email" in input &&
        typeof input.email === "string" &&
        input.email.length <= 254
      ) {
        const rate = await consumeLimit(
          `email:${path}:${input.email.trim().toLowerCase()}`,
          { window: 60, max: limits[path] },
        );
        if (!rate.allowed)
          return Response.json(
            {
              code: "TOO_MANY_REQUESTS",
              message: "잠시 후 다시 시도해 주세요.",
            },
            {
              status: 429,
              headers: {
                "Cache-Control": "no-store",
                "Retry-After": String(rate.retryAfter),
              },
            },
          );
      }
    }
    return await handlers.POST(forwarded);
  } catch (error) {
    return Response.json(
      {
        code: error instanceof ApiError ? error.code : "SERVER_ERROR",
        message:
          error instanceof ApiError
            ? error.message
            : "서버에서 요청을 처리하지 못했어요.",
      },
      {
        status: error instanceof ApiError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
