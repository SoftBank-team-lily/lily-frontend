import "server-only";
import { ApiError } from "@/lib/api";
import type { CloudProvider, DeploySettings } from "./types";

/** 등록 시 저장소 적합성을 판단한다. 비용·지연 시간 최적화 API와 별도다. */
export async function chooseCloudAutomatically(repo: string, settings: DeploySettings): Promise<{ provider: CloudProvider; reason: string }> {
  const url = process.env.BUILDER_URL;
  const token = process.env.CLOUD_API_TOKEN;
  if (!url || !token) throw new ApiError(503, "CLOUD_SELECTION_UNCONFIGURED", "자동 선택 연결이 필요해요. 수동 선택으로 배포할 수 있어요.");
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}/api/cloud/selection`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ repoUrl: `https://github.com/${repo}`, branch: settings.branch || "main", rootDir: settings.rootDir || "", appName: "selection-preview", database: settings.database || "auto", deploymentMode: "HYBRID", env: {} }),
      cache: "no-store", signal: AbortSignal.timeout(45_000),
    });
  } catch { throw new ApiError(503, "CLOUD_SELECTION_UNAVAILABLE", "자동 선택 서버에 연결하지 못했어요. 다시 시도하거나 수동으로 선택해 주세요."); }
  let body: { status?: string; provider?: string; confidence?: number; reason?: string; repository?: { commit?: string } };
  try { body = await response.json(); }
  catch { throw new ApiError(502, "CLOUD_SELECTION_INVALID", "자동 선택 응답을 확인하지 못했어요."); }
  const reasons: Record<string, string> = {
    cloud_workers_unconfigured: "자동 선택용 AWS/GCP 작업기 설정이 필요해요. 수동으로 선택하거나 관리자에게 문의해 주세요.",
    jev_unconfigured: "자동 선택 서버에 JEV 키 설정이 필요해요. 수동으로 선택할 수 있어요.",
    repository_evidence_missing: "저장소에서 분석할 의존성 파일을 찾지 못했어요. 앱 폴더를 확인하거나 수동으로 선택해 주세요.",
    jev_unavailable: "JEV 응답을 받지 못했어요. 다시 시도하거나 수동으로 선택해 주세요.",
  };
  if (!response.ok || body.status !== "selected" || !["AWS", "GCP"].includes(body.provider ?? "") || typeof body.confidence !== "number" || !Number.isFinite(body.confidence) || body.confidence < 0.8 || body.confidence > 1)
    throw new ApiError(409, "CLOUD_SELECTION_HELD", reasons[body.reason ?? ""] ?? "JEV가 클라우드 선택을 보류했어요. 저장소 분석과 작업기 설정을 확인하거나 수동으로 선택해 주세요.");
  return { provider: body.provider as CloudProvider, reason: `JEV · ${body.provider} · ${Math.round(body.confidence * 100)}%${body.repository?.commit && /^[a-f0-9]{40}$/.test(body.repository.commit) ? ` · ${body.repository.commit.slice(0, 7)}` : ""}` };
}
