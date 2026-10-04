import "server-only";
import { ApiError } from "@/lib/api";
import type { CloudProvider, DeploySettings } from "./types";

/** 등록 시 저장소 적합성을 판단한다. 비용·지연 시간 최적화 API와 별도다. */
export async function chooseCloudAutomatically(repo: string, settings: DeploySettings): Promise<{ provider: CloudProvider; reason: string }> {
  const url = process.env.BUILDER_URL;
  if (!url) throw new ApiError(503, "CLOUD_SELECTION_UNCONFIGURED", "자동 선택 연결이 필요해요. 수동 선택으로 배포할 수 있어요.");
  const token = process.env.CLOUD_API_TOKEN;
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}/api/cloud/selection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ repoUrl: `https://github.com/${repo}`, branch: settings.branch || "main", rootDir: settings.rootDir || "", appName: "selection-preview", database: settings.database || "auto", deploymentMode: "HYBRID", env: {} }),
      cache: "no-store", signal: AbortSignal.timeout(45_000),
    });
  } catch { throw new ApiError(503, "CLOUD_SELECTION_UNAVAILABLE", "자동 선택 서버에 연결하지 못했어요. 다시 시도하거나 수동으로 선택해 주세요."); }
  let body: { status?: string; provider?: string; confidence?: number; reason?: string; error?: string; repository?: { commit?: string } };
  try { body = await response.json(); }
  catch { throw new ApiError(502, "CLOUD_SELECTION_INVALID", "자동 선택 응답을 확인하지 못했어요."); }
  const reasons: Record<string, string> = {
    cloud_disabled: "빌더의 자동 선택이 토큰 없이 막혀 있어요. 빌더를 이 수정이 들어간 이미지로 올린 뒤 다시 시도해 주세요.",
    cloud_workers_unconfigured: "자동 선택용 AWS/GCP 작업기 설정이 필요해요. 수동으로 선택하거나 관리자에게 문의해 주세요.",
    jev_unconfigured: "자동 선택 서버에 JEV 키 설정이 필요해요. 수동으로 선택할 수 있어요.",
    repository_evidence_missing: "저장소에서 분석할 의존성 파일을 찾지 못했어요. 앱 폴더를 확인하거나 수동으로 선택해 주세요.",
    jev_unavailable: "JEV 응답을 받지 못했어요. 다시 시도하거나 수동으로 선택해 주세요.",
  };
  const code = body.reason ?? body.error ?? "";
  const provider = body.provider ?? "";
  if (!response.ok || body.status !== "selected" || !["AWS", "GCP"].includes(provider))
    throw new ApiError(409, "CLOUD_SELECTION_HELD", reasons[code] ?? "클라우드를 자동으로 정하지 못했어요. 저장소 분석과 작업기 설정을 확인하거나 수동으로 선택해 주세요.");
  // 후보가 하나이거나 레포가 어느 쪽에도 묶이지 않거나 JEV 가 정하지 못하면 builder 가 규칙으로 정한다. 확신도가 없다.
  const ruled: Record<string, string> = { single_candidate: "준비된 클라우드", portable_default: "특정 클라우드에 묶이지 않음", fallback_default: "기본값" };
  if (body.confidence == null && code in ruled) return { provider: provider as CloudProvider, reason: `자동 · ${provider} · ${ruled[code]}` };
  if (typeof body.confidence !== "number" || !Number.isFinite(body.confidence) || body.confidence < 0.8 || body.confidence > 1)
    throw new ApiError(409, "CLOUD_SELECTION_HELD", reasons[code] ?? "클라우드를 자동으로 정하지 못했어요. 저장소 분석과 작업기 설정을 확인하거나 수동으로 선택해 주세요.");
  return { provider: provider as CloudProvider, reason: `JEV · ${provider} · ${Math.round(body.confidence * 100)}%${body.repository?.commit && /^[a-f0-9]{40}$/.test(body.repository.commit) ? ` · ${body.repository.commit.slice(0, 7)}` : ""}` };
}
