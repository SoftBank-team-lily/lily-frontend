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
import { readSettings } from "@/lib/projects/settingsForm";
import { detectDatabase, ProjectError } from "@/lib/projects/client";
import { findProject } from "@/lib/deploy/realDeploy";
import type { DatabaseChoice, DeploySettings } from "@/lib/projects/types";
import { DatabaseDialog } from "@/components/projects/DatabaseDialog";
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
  onNeedLogin,
  onEnterDashboard,
  navigation,
  project,
  beforeEnter,
  onResetProject,
}: {
  onComplete?: (result: DeployResult) => void;
  /** 로그인하지 않고 배포를 시작했을 때 */
  onNeedLogin?: () => void;
  onEnterDashboard?: DashboardHandler;
  navigation?: ReactNode;
  project?: ReadyProject;
  beforeEnter?: () => Promise<EntryCheck>;
  onResetProject?: () => void;
}) {
  const [repo, setRepo] = useState(project?.repo ?? "");
  const [error, setError] = useState("");
  /** 기존 프로젝트·DB 를 확인하는 중 */
  const [checking, setChecking] = useState(false);
  /** DB 확인을 기다리는 새 프로젝트. 생성을 누르면 고른 DB 로 등록하고 배포한다 */
  const [choice, setChoice] = useState<{
    repo: string;
    settings: DeploySettings;
    detected: DatabaseChoice;
  } | null>(null);
  const nav = useRef<HTMLElement>(null);
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [flowerAvailable, setFlowerAvailable] = useState(false);
  const deploy = useDeploy({ onComplete, onNeedLogin });
  const state = project ? toDeployState(project) : deploy.state;
  const { start, reset } = deploy;
  const finished =
    state.phase === "succeeded" ||
    state.phase === "rolled-back" ||
    state.phase === "failed";
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || checking || entry.busy) return;
    const parsed = parseRepo(repo);
    if (!parsed) {
      setError(REPO_ERROR);
      input.current?.focus();
      return;
    }
    let settings;
    try {
      settings = readSettings(new FormData(event.currentTarget));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : REPO_ERROR);
      return;
    }
    setError("");
    entry.clearMessage();
    // 이미 등록한 프로젝트는 등록할 때 고른 DB 로 다시 배포한다. 새 프로젝트만 DB 를 묻는다
    setChecking(true);
    try {
      if (await findProject(parsed, settings.rootDir)) {
        start(parsed, settings);
        return;
      }
      const detected = await detectDatabase(parsed, settings);
      setChoice({ repo: parsed, settings, detected });
    } catch (problem) {
      if (problem instanceof ProjectError && problem.status === 401) onNeedLogin?.();
      else
        setError(
          problem instanceof ProjectError
            ? problem.message
            : "서버에 연결하지 못했어요.",
        );
    } finally {
      setChecking(false);
    }
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
        : state.phase === "failed"
          ? "배포하지 못했어요"
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
                  : "GitHub 레포 주소만 넣으면 빌드부터 배포까지 해요. 배포가 진행될수록 꽃에 색이 번져요."}
              </p>
            </div>
            {project ? (
              <p className="mt-7 break-all text-note text-mute">
                {project.repo}
              </p>
            ) : (
              <DeployForm
                repo={repo}
                error={error}
                disabled={disabled || checking || !!choice || entry.busy}
                inputRef={input}
                onRepoChange={setRepo}
                onSubmit={submit}
              />
            )}
            {choice && (
              <DatabaseDialog
                detected={choice.detected}
                onCancel={() => {
                  setChoice(null);
                  input.current?.focus();
                }}
                onCreate={(database) => {
                  setChoice(null);
                  start(choice.repo, { ...choice.settings, database });
                }}
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
                    가 피었어요.{" "}
                    {state.result.url ? (
                      <>
                        주소는{" "}
                        <a
                          href={state.result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-ink underline"
                        >
                          {state.result.url.replace(/^https?:\/\//, "")}
                        </a>
                        이고,{" "}
                      </>
                    ) : null}
                    모니터링 화면에서 상태를 계속 볼 수 있어요.
                  </>
                )}
                {!finished && state.log && (
                  <span className="block break-all font-mono text-caption text-mute">
                    {state.log}
                  </span>
                )}
                {state.result?.outcome === "rolled-back" &&
                  (state.result.message ?? ROLLBACK_MESSAGE)}
                {state.result?.outcome === "failed" && (
                  <>
                    {state.result.message ?? "배포 서버가 이유를 남기지 않았어요."}{" "}
                    내 계정에서 설정을 고친 뒤 다시 배포할 수 있어요.
                  </>
                )}
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
