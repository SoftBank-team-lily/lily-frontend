"use client";

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
