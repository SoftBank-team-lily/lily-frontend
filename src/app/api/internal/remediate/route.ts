import { apiError, json } from "@/lib/api";

export const runtime = "nodejs";

/** REMEDIATE_ENABLED 가 true 가 아니면 사건 본문도 읽지 않는다. */
export async function POST(request: Request) {
  if (process.env.REMEDIATE_ENABLED !== "true") {
    return json({ status: "off", reason: "REMEDIATE_ENABLED 가 꺼져 있다" });
  }
  try {
    const { acceptIncident } = await import("@/lib/remediate/accept");
    return json(await acceptIncident(request));
  } catch (error) {
    return apiError(error);
  }
}
