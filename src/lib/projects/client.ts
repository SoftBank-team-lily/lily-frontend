"use client";

import type { DatabaseChoice } from "./types";

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

/**
 * 등록 전 DB 감지. 감지하지 못했으면 none.
 * @throws ProjectError 입력·로그인 문제(4xx). 서버 쪽 실패는 none 으로 본다
 */
export async function detectDatabase(
  repo: string,
  settings: { branch?: string; rootDir?: string },
  signal?: AbortSignal,
): Promise<DatabaseChoice> {
  try {
    const result = await projectRequest<{ database: DatabaseChoice }>("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        repo,
        ...(settings.branch ? { branch: settings.branch } : {}),
        ...(settings.rootDir ? { rootDir: settings.rootDir } : {}),
      }),
    });
    return result.database;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ProjectError && error.status < 500) throw error;
    return "none";
  }
}
