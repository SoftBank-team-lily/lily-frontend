"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { selectFlowerTargets } from "@/lib/deploy/deployReducer";
import { useDeploy } from "@/lib/deploy/useDeploy";
import { STAGES, REPO_ERROR, ROLLBACK_MESSAGE } from "@/lib/deploy/stages";
import type { DeployResult } from "@/lib/deploy/types";
import type { DashboardHandler, EntryCheck } from "@/lib/dashboard/types";
import type { ReadyProject } from "@/lib/projects/types";
import { toDeployState } from "@/lib/projects/toDeployState";
import { parseRepo } from "@/lib/repo/parseRepo";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { useDashboardEntry } from "@/lib/hooks/useDashboardEntry";
import { DeployStatus } from "@/components/deploy/DeployStatus";
import { FlowerCanvas } from "@/components/flower/FlowerCanvas";
import { SiteNav } from "@/components/layout/SiteNav";
import { Reveal } from "@/components/layout/Reveal";
import { DeployForm } from "@/components/deploy/DeployForm";
import { Button } from "@/components/ui/Button";
import type { ReactNode } from "react";

export function LandingPage({
  onComplete,
  onEnterDashboard,
  navigation,
  project,
  beforeEnter,
  onResetProject,
}: {
  onComplete?: (result: DeployResult) => void;
  onEnterDashboard?: DashboardHandler;
  navigation?: ReactNode;
  project?: ReadyProject;
  beforeEnter?: () => Promise<EntryCheck>;
  onResetProject?: () => void;
}) {
  const [repo, setRepo] = useState(project?.repo ?? "");
  const [fail, setFail] = useState(false);
  const [error, setError] = useState("");
  const nav = useRef<HTMLElement>(null);
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [flowerAvailable, setFlowerAvailable] = useState(false);
  const deploy = useDeploy({ reducedMotion, onComplete });
  const state = project ? toDeployState(project) : deploy.state;
  const { start, reset } = deploy;
  const finished = state.phase === "succeeded" || state.phase === "rolled-back";
  const dashboardReady =
    state.phase === "succeeded" && state.result?.outcome === "succeeded";
  const entry = useDashboardEntry({
    reducedMotion,
    flowerAvailable,
    blocked: !dashboardReady,
    result: state.result,
    onEnterDashboard,
    beforeEnter,
    projectId: project?.id,
  });
  const getSlot = useCallback(
    () => ({
      top:
        window.innerWidth >= 700
          ? 12
          : (nav.current?.getBoundingClientRect().bottom ?? 64) - 8,
      bottom: section.current
        ? section.current.getBoundingClientRect().top +
          window.scrollY +
          parseFloat(getComputedStyle(section.current).paddingTop) -
          16
        : window.innerHeight * 0.52 - 16,
    }),
    [],
  );
  const disabled = state.phase !== "idle";
  const entryDisabled = entry.busy || !dashboardReady || !flowerAvailable;
  const fallbackEntry =
    dashboardReady && !flowerAvailable ? (
      <Button
        variant="ghost"
        data-dashboard-entry
        disabled={entry.busy}
        onClick={entry.enter}
      >
        대시보드로 이동
      </Button>
    ) : undefined;
  const getEntrySlot = useCallback(
    () => ({
      top: nav.current?.getBoundingClientRect().bottom ?? 64,
      bottom: section.current
        ? section.current.getBoundingClientRect().top +
          parseFloat(getComputedStyle(section.current).paddingTop) -
          16
        : 0,
    }),
    [],
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || entry.busy) return;
    const parsed = parseRepo(repo);
    if (!parsed) {
      setError(REPO_ERROR);
      input.current?.focus();
      return;
    }
    setError("");
    entry.clearMessage();
    start(parsed, fail);
  }
  function restart() {
    if (entry.busy) return;
    entry.clearMessage();
    if (project) {
      onResetProject?.();
      return;
    }
    flushSync(() => reset());
    input.current?.focus();
  }
  const stage =
    state.phase === "succeeded"
      ? "배포 완료"
      : state.phase === "rolled-back"
        ? "이전 버전으로 되돌렸어요"
        : state.phase === "threshold-exceeded"
          ? "에러율 기준 초과"
          : STAGES[state.index].name;
  return (
    <>
      <FlowerCanvas
        getSlot={getSlot}
        reducedMotion={reducedMotion}
        targets={selectFlowerTargets(state)}
        controlsRef={entry.controls}
        getEntrySlot={getEntrySlot}
        entryDisabled={entryDisabled}
        onAvailable={setFlowerAvailable}
        onEnter={() => {
          if (!entryDisabled) entry.enter();
        }}
      />
      <div
        className="landing-content"
        data-entry-phase={entry.phase}
        inert={entry.busy}
      >
        <SiteNav ref={nav}>{navigation}</SiteNav>
        <main className="relative z-1">
          <Reveal
            ref={section}
            id="deploy"
            className="mx-auto flex min-h-screen max-w-page flex-col items-center px-6 pt-[52vh] pb-[6vh] text-center"
          >
            <div className="max-w-lg break-keep text-shadow-halo">
              <h2 className="mb-[0.8rem] text-display font-semibold">
                {project ? "프로젝트가 피었어요." : "지금 피워 보세요."}
              </h2>
              <p className="text-lead text-mute">
                {project
                  ? `${project.name}의 배포가 완료됐어요. 꽃을 눌러 대시보드를 열어 보세요.`
                  : "배포가 진행될수록 꽃에 색이 번져요. 이 화면은 시연용이라 실제 배포는 일어나지 않아요."}
              </p>
            </div>
            {project ? (
              <p className="mt-7 break-all text-note text-mute">
                {project.repo}
              </p>
            ) : (
              <DeployForm
                repo={repo}
                fail={fail}
                error={error}
                disabled={disabled || entry.busy}
                inputRef={input}
                onRepoChange={setRepo}
                onFailChange={setFail}
                onSubmit={submit}
              />
            )}
            {flowerAvailable && dashboardReady && (
              <p className="text-caption text-mute">
                꽃을 누르면 대시보드로 이동해요.
              </p>
            )}
            {disabled && (
              <DeployStatus
                stage={stage}
                step={state.index + 1}
                fractions={state.fractions}
                failedIndex={state.failedIndex}
                finished={finished}
                onReset={restart}
                resetDisabled={entry.busy}
                resetLabel={project ? "내 프로젝트로" : undefined}
                actions={fallbackEntry}
              >
                {project && (
                  <>
                    <b className="font-semibold text-ink">{project.name}</b>{" "}
                    프로젝트가 정상 배포됐어요.
                  </>
                )}
                {!project && state.result?.outcome === "succeeded" && (
                  <>
                    <b className="font-semibold text-ink">
                      {state.result.repo}
                    </b>
                    가 피었어요. 주소는{" "}
                    <a
                      href="#"
                      className="text-ink underline"
                      onClick={(event) => event.preventDefault()}
                    >
                      {state.result.slug}.lily.app
                    </a>
                    이고, 모니터링 화면에서 상태를 계속 볼 수 있어요.
                  </>
                )}
                {state.result?.outcome === "rolled-back" && ROLLBACK_MESSAGE}
              </DeployStatus>
            )}
          </Reveal>
        </main>
      </div>
      <p
        role="status"
        className="pointer-events-none fixed inset-x-6 bottom-6 z-20 text-center text-caption text-mute"
      >
        {entry.phase === "checking"
          ? "진입 권한을 확인하고 있어요."
          : entry.busy
            ? "대시보드로 이동 중입니다."
            : entry.message}
      </p>
    </>
  );
}
