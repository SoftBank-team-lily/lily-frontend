"use client";

import type { DatabaseChoice, Detection, Project } from "./types";

export class ProjectError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function projectRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok)
    throw new ProjectError(
      response.status,
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "요청을 처리하지 못했어요.",
    );
  return data as T;
}

const NO_DETECTION: Detection = { database: "none", dir: null, apps: [], config: [], problem: null };

/**
 * 등록 전 감지: DB, 앱 폴더 후보, 기동에 필요한 설정 키. 감지하지 못했으면 DB 없음과 빈 목록.
 * @throws ProjectError 입력·로그인 문제(4xx). 서버 쪽 실패는 감지 못 함으로 본다
 */
export async function detectRepo(
  repo: string,
  settings: { branch?: string; rootDir?: string },
  signal?: AbortSignal,
): Promise<Detection> {
  try {
    const result = await projectRequest<{ detection?: Detection; database: DatabaseChoice }>("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        repo,
        ...(settings.branch ? { branch: settings.branch } : {}),
        ...(settings.rootDir ? { rootDir: settings.rootDir } : {}),
      }),
    });
    return result.detection ?? { ...NO_DETECTION, database: result.database };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ProjectError && error.status < 500) throw error;
    return NO_DETECTION;
  }
}

/** 배포 전 확인 창·실패 고치기에서 고른 값 */
export type FixInput = {
  env?: Record<string, string>;
  generateEnv?: string[];
  reuseEnv?: string[];
  port?: number;
  healthPath?: string;
  database?: DatabaseChoice;
  rootDir?: string;
};

/** 실패한 배포를 고친다. redeploy 면 바로 다시 배포한다 */
export function fixProject(id: string, input: FixInput, redeploy: boolean) {
  return projectRequest<Project>(`/api/projects/${id}/fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, redeploy }),
  });
}
