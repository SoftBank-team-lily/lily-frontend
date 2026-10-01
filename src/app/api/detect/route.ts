import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { detectRepo } from "@/lib/projects/detect";
import { detectSchema, validate } from "@/lib/projects/schema";

// 등록하기 전에 레포가 쓰는 DB, 앱 폴더, 기동에 필요한 설정 키를 lily-builder 로 본다. 화면이 확인 창으로 보여 주고 사용자가 고른다
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "detect", 30);
    const input = validate(detectSchema, await readJson(request));
    const detection = await detectRepo(user.id, input.repo, input.branch, input.rootDir);
    return json({ database: detection.database, detection });
  } catch (error) {
    return apiError(error);
  }
}
