import { apiError, json, readJson, requireRunner } from "@/lib/api";
import { recordEvent } from "@/lib/projects/server";
import { eventSchema, idSchema, validate } from "@/lib/projects/schema";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireRunner(request);
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
