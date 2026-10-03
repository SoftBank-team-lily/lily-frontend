"use client";

import { useCallback, useEffect, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { FixProgress } from "./types";

export function useFixProgress(projectId?: string) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    projectId: string; data?: FixProgress; error?: string;
  }>();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let stopped = false;
    async function poll() {
      if (polling || stopped || controller.signal.aborted) return;
      polling = true;
      if (timer) clearTimeout(timer);
      let delay = 15000;
      try {
        const data = await projectRequest<FixProgress>(`/api/projects/${projectId}/fixes`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (controller.signal.aborted) return;
        setSnapshot({ projectId: projectId!, data });
        if (data.runs.some((run) => run.status === "running")) delay = 3000;
      } catch (error) {
        if (controller.signal.aborted) return;
        stopped = error instanceof ProjectError && [401, 403, 404].includes(error.status);
        setSnapshot((previous) => ({
          projectId: projectId!,
          data: previous?.projectId === projectId ? previous?.data : undefined,
          error: stopped ? "AI 수정 이력을 보려면 로그인 상태를 확인해 주세요." : "AI 수정 상태를 가져오지 못했어요. 다시 연결하고 있어요.",
        }));
      } finally {
        polling = false;
        if (!stopped && !controller.signal.aborted)
          timer = setTimeout(poll, document.hidden ? 60000 : delay);
      }
    }
    function visible() { if (!document.hidden) void poll(); }
    document.addEventListener("visibilitychange", visible);
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [projectId, revision]);
  return { ...(snapshot?.projectId === projectId ? snapshot : {}), refresh };
}
