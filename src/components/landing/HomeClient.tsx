"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/auth/types";
import { authClient } from "@/lib/auth/client";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { ReadyProject, ProjectEntry } from "@/lib/projects/types";
import type { EntryCheck } from "@/lib/dashboard/types";
import { AuthNav } from "@/components/auth/AuthNav";
import { LandingPage } from "./LandingPage";

export function HomeClient({
  user,
  project,
  dashboardConnected = false,
}: {
  user: User | null;
  project?: ReadyProject;
  dashboardConnected?: boolean;
}) {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const viewer = isPending ? user : (data?.user ?? null);
  const activeProject = viewer?.id === user?.id ? project : undefined;
  // 이 화면에서 방금 배포를 마친 프로젝트. 꽃을 누르면 이 프로젝트의 대시보드로 간다
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const targetId = activeProject?.id ?? deployedId;
  const next = activeProject ? `/?project=${activeProject.id}` : "/";
  const login = useCallback(
    () => router.replace(`/login?next=${encodeURIComponent(next)}`),
    [next, router],
  );
  const beforeEnter = useCallback(async (): Promise<EntryCheck> => {
    try {
      if (targetId) {
        await projectRequest<ProjectEntry>(`/api/projects/${targetId}/entry`);
        return { allowed: true };
      }
      const session = await authClient.getSession();
      if (session.error)
        return {
          allowed: false,
          message: "로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.",
        };
      if (!session.data?.user) {
        login();
        return { allowed: false };
      }
      return {
        allowed: false,
        message: "배포가 완료된 프로젝트를 내 계정에서 선택해 주세요.",
      };
    } catch (error) {
      if (error instanceof ProjectError && error.status === 401) {
        login();
        return { allowed: false };
      }
      return {
        allowed: false,
        message:
          error instanceof ProjectError
            ? error.message
            : "프로젝트를 확인하지 못했어요.",
      };
    }
  }, [targetId, login]);
  const enterDashboard = useCallback(async () => {
    if (!targetId) return;
    try {
      const entry = await projectRequest<ProjectEntry>(
        `/api/projects/${targetId}/entry`,
      );
      if (!entry.destination) throw new Error("대시보드 미연결");
      window.location.assign(entry.destination);
    } catch (error) {
      if (error instanceof ProjectError && error.status === 401) login();
      else throw error;
    }
  }, [targetId, login]);
  return (
    <LandingPage
      key={`${viewer?.id ?? "guest"}:${activeProject?.id ?? "demo"}`}
      navigation={<AuthNav user={user} />}
      project={activeProject}
      beforeEnter={beforeEnter}
      onComplete={(result) => {
        if (result.outcome === "succeeded" && result.projectId)
          setDeployedId(result.projectId);
      }}
      onNeedLogin={login}
      onEnterDashboard={
        targetId && dashboardConnected ? enterDashboard : undefined
      }
      onResetProject={() => router.replace("/account")}
    />
  );
}
