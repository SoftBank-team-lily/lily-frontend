import { commitSha } from "@/lib/builder/run";
import type { FixStage } from "./types";

export type RemediateStatus = "off" | "rejected" | "opened";

/** 화면이 안내를 고르는 이유 코드. reason 은 사람이 읽는 설명이다 */
export type ReasonCode =
  | "disabled" | "consent" | "github" | "commit" | "duplicate" | "no-files"
  | "not-code" | "no-patch" | "draft-rejected";

export type RemediateResult = {
  status: RemediateStatus;
  reason: string;
  code: ReasonCode | null;
  url?: string;
};

export type Incident = {
  app: string;
  signature: string;
  log: string;
  files: string[];
};

export type ProjectFix = {
  enabled: boolean;
  consent: boolean;
  installationId: string | null;
  commitSha: string | null;
  openSignatures: string[];
};

export type DraftResult =
  | { status: "off" | "rejected"; reason: string; code: ReasonCode }
  | { status: "draft"; files: Record<string, string> };

export type RemediateDeps = {
  draft: () => Promise<DraftResult>;
  openPull: (files: Record<string, string>) => Promise<string>;
  progress?: (stage: FixStage, files?: string[]) => Promise<void>;
};

/** 모델과 GitHub 를 부르기 전에 서버가 거절한다. */
export async function remediate(
  incident: Incident,
  project: ProjectFix,
  deps: RemediateDeps,
): Promise<RemediateResult> {
  if (!project.enabled) {
    return { status: "off", reason: "REMEDIATE_ENABLED 가 꺼져 있다", code: "disabled" };
  }
  if (!project.consent) {
    return { status: "off", reason: "프로젝트 동의가 꺼져 있다", code: "consent" };
  }
  if (!project.installationId) {
    return { status: "rejected", reason: "GitHub App 설치가 없다", code: "github" };
  }
  if (!commitSha(project.commitSha)) {
    return { status: "rejected", reason: "배포 커밋이 없다", code: "commit" };
  }
  if (project.openSignatures.includes(incident.signature)) {
    return { status: "rejected", reason: "같은 서명의 PR이 열려 있다", code: "duplicate" };
  }
  if (incident.files.length === 0) {
    return { status: "rejected", reason: "레포 안 프레임이 없다", code: "no-files" };
  }
  await deps.progress?.("drafting");
  const draft = await deps.draft();
  if (draft.status !== "draft") return draft;
  await deps.progress?.("checking");
  const paths = guardPaths(draft.files, incident.files);
  if (!paths.ok) return { status: "rejected", reason: paths.reason, code: "draft-rejected" };
  await deps.progress?.("opening-pr", Object.keys(draft.files));
  const url = await deps.openPull(draft.files);
  return { status: "opened", reason: "", code: null, url };
}

export function guardPaths(
  files: Record<string, string>,
  allowed: string[],
): { ok: true } | { ok: false; reason: string } {
  const paths = Object.keys(files);
  if (paths.length === 0) return { ok: false, reason: "파일 변경이 없다" };
  for (const path of paths) {
    if (forbidden(path)) return { ok: false, reason: `고칠 수 없는 경로: ${path}` };
    if (!allowed.includes(path)) return { ok: false, reason: `허용되지 않은 경로: ${path}` };
  }
  return { ok: true };
}

export function forbidden(path: string) {
  const name = path.replaceAll("\\", "/");
  if (name.startsWith("/") || name.includes("..")) return true;
  const base = name.slice(name.lastIndexOf("/") + 1);
  if (base === ".env" || base.startsWith(".env.") || base.endsWith(".pem") || base.endsWith(".key")) {
    return true;
  }
  return name === ".github/workflows" || name.startsWith(".github/workflows/") || name.includes("/.github/workflows/");
}
