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
      // 서비스가 꺼져 있거나, 동의가 없고 진행 중인 작업도 없으면 바뀔 것이 없다. 동의를 바꾸면 refresh 로 다시 시작한다
      let idle = false;
      try {
        const data = await projectRequest<FixProgress>(`/api/projects/${projectId}/fixes`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (controller.signal.aborted) return;
        if (!data || !Array.isArray(data.runs) || typeof data.enabled !== "boolean" || typeof data.consent !== "boolean" || typeof data.githubApp !== "boolean")
          throw new Error("Invalid AI repair progress response");
        setSnapshot({ projectId: projectId!, data });
        const running = data.runs.some((run) => run.status === "running");
        if (running) delay = 3000;
        idle = !data.enabled || (!data.consent && !running);
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
        // 숨겨진 탭은 묻지 않는다. 다시 보이면 visibilitychange 가 바로 묻는다
        if (!stopped && !idle && !document.hidden && !controller.signal.aborted)
          timer = setTimeout(poll, delay);
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
