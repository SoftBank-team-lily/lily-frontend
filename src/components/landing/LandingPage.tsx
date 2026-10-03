"use client";

import { useI18n } from "@/lib/i18n/provider";

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
import {
  detectRepo,
  fixProject,
  ProjectError,
  type FixInput,
} from "@/lib/projects/client";
import { findProject, otherTarget } from "@/lib/deploy/realDeploy";
import type {
  CloudProvider,
  Detection,
  DeploymentMode,
  DeploySettings,
  DeployTarget,
  Project,
} from "@/lib/projects/types";
import type { AgentState } from "@/lib/agents/types";
import {
  DeployCheckDialog,
  type DeployChoice,
} from "@/components/projects/DeployCheckDialog";
import { FixPanel } from "@/components/projects/FixPanel";
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
  const { t } = useI18n();
  const [repo, setRepo] = useState(project?.repo ?? "");
  const [error, setError] = useState("");
  /** 기존 프로젝트·DB 를 확인하는 중 */
  const [checking, setChecking] = useState(false);
  /**
   * 배포 전 확인을 기다리는 레포. 새 프로젝트면 고른 값으로 등록하고,
   * 실패했던 프로젝트(existing)면 고친 값을 저장한 뒤 다시 배포한다
   */
  const [choice, setChoice] = useState<{
    repo: string;
    settings: DeploySettings;
    detection: Detection;
    existing: Project | null;
  } | null>(null);
  /** 마지막으로 시작한 배포. 실패를 고친 뒤 같은 값으로 다시 시작한다 */
  const last = useRef<{
    repo: string;
    settings: DeploySettings;
    target: DeployTarget;
  } | null>(null);
  const [mode, setMode] = useState<DeploymentMode>("HYBRID");
  const [selection, setSelection] = useState<"auto" | "manual">("auto");
  const [provider, setProvider] = useState<CloudProvider>("AWS");
  const [target, setTarget] = useState<DeployTarget>("cloud");
  const [agent, setAgent] = useState<AgentState>(null);
  const place = mode === "ONPREM_ONLY" ? "onprem" : target;
  const waitingAgent = place === "onprem" && !agent?.connected;
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
        {t("대시보드로 이동")}
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
    if (disabled || checking || entry.busy || waitingAgent) return;
    const parsed = parseRepo(repo);
    if (!parsed) {
      setError(REPO_ERROR);
      input.current?.focus();
      return;
    }
    let settings: DeploySettings;
    try {
      settings = {
        ...readSettings(new FormData(event.currentTarget)),
        deploymentMode: mode,
        ...(mode === "ONPREM_ONLY" ? {} : { cloudSelection: selection, ...(selection === "manual" ? { cloudProvider: provider } : {}) }),
      };
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : REPO_ERROR);
      return;
    }
    setError("");
    entry.clearMessage();
    // 이미 잘 배포된 프로젝트는 바로 다시 배포한다. 새 프로젝트와 실패했던 프로젝트는 배포 전 확인을 거친다
    setChecking(true);
    try {
      const existing = await findProject(parsed, settings.rootDir);
      if (existing) {
        if ((existing.deploymentMode ?? "HYBRID") !== mode)
          throw new ProjectError(
            409,
            "MODE_LOCKED",
            "배포 모드는 프로젝트를 만든 뒤에 바꿀 수 없어요.",
          );
        if (selection === "manual" && mode !== "ONPREM_ONLY" && (existing.cloudProvider ?? "AWS") !== provider)
          throw new ProjectError(
            409,
            "PROVIDER_LOCKED",
            "클라우드 제공자는 프로젝트를 만든 뒤에 바꿀 수 없어요.",
          );
        const conflict = otherTarget(existing, place);
        if (conflict) throw conflict;
        if (existing.latestDeployment?.status !== "failed") {
          launch(parsed, settings);
          return;
        }
      }
      const detection = await detectRepo(parsed, settings);
      setChoice({ repo: parsed, settings, detection, existing });
    } catch (problem) {
      if (problem instanceof ProjectError && problem.status === 401)
        onNeedLogin?.();
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
  function launch(repoRef: string, settings: DeploySettings) {
    last.current = { repo: repoRef, settings, target: place };
    start(repoRef, settings, place);
  }
  /** 확인 창에서 고른 값으로 등록(새 프로젝트)하거나 고친 뒤(실패했던 프로젝트) 배포한다 */
  async function confirm(picked: DeployChoice) {
    if (!choice) return;
    const { repo: repoRef, settings, existing } = choice;
    setChoice(null);
    const rootDir = picked.rootDir ?? settings.rootDir;
    try {
      if (existing) {
        await fixProject(
          existing.id,
          {
            env: { ...picked.env, ...(settings.env ?? {}) },
            generateEnv: picked.generateEnv,
            reuseEnv: picked.reuseEnv,
            ...(picked.rootDir !== undefined &&
            picked.rootDir !== existing.rootDir
              ? { rootDir: picked.rootDir }
              : {}),
          },
          false,
        );
        launch(repoRef, { ...settings, rootDir });
        return;
      }
      launch(repoRef, {
        ...settings,
        rootDir,
        database: picked.database,
        ...(picked.databaseLocation
          ? { databaseLocation: picked.databaseLocation }
          : {}),
        ...(picked.databaseUrl ? { databaseUrl: picked.databaseUrl } : {}),
        env: { ...picked.env, ...(settings.env ?? {}) },
        generateEnv: picked.generateEnv,
        reuseEnv: picked.reuseEnv,
      });
    } catch (problem) {
      setError(
        problem instanceof ProjectError
          ? problem.message
          : "서버에 연결하지 못했어요.",
      );
    }
  }
  /** 실패 화면에서 고치기: 저장하고 같은 레포를 다시 배포해 따라간다 */
  async function applyFix(input: FixInput) {
    const projectId = state.result?.projectId;
    const previous = last.current;
    if (!projectId || !previous) return;
    await fixProject(projectId, input, false);
    flushSync(() => reset());
    launch(previous.repo, {
      ...previous.settings,
      ...(input.rootDir !== undefined ? { rootDir: input.rootDir } : {}),
    });
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
      ? t("배포 완료")
      : state.phase === "rolled-back"
        ? t("이전 버전으로 되돌렸어요")
        : state.phase === "failed"
          ? t("배포하지 못했어요")
          : state.phase === "threshold-exceeded"
            ? t("에러율 기준 초과")
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
                {project ? t("프로젝트가 피었어요.") : t("지금 피워 보세요.")}
              </h2>
              <p className="text-lead text-mute">
                {project
                  ? t(
                      "{{value0}}의 배포가 완료됐어요. 꽃을 눌러 대시보드를 열어 보세요.",
                      { value0: project.name },
                    )
                  : t(
                      "GitHub 레포 주소만 넣으면 빌드부터 배포까지 해요. 배포가 진행될수록 꽃에 색이 번져요.",
                    )}
              </p>
            </div>
            {project ? (
              <p className="mt-7 break-all text-note text-mute">
                {project.repo}
              </p>
            ) : (
              <DeployForm
                repo={repo}
                error={t(error)}
                disabled={disabled || checking || !!choice || entry.busy}
                inputRef={input}
                onRepoChange={setRepo}
                onSubmit={submit}
                target={target}
                onTargetChange={setTarget}
                mode={mode}
                onModeChange={(next) => {
                  setMode(next);
                  if (next === "ONPREM_ONLY") setTarget("onprem");
                }}
                selection={selection}
                onSelectionChange={setSelection}
                provider={provider}
                onProviderChange={setProvider}
                onAgentChange={setAgent}
                onNeedLogin={onNeedLogin}
                waitingAgent={waitingAgent}
              />
            )}
            {choice && (
              <DeployCheckDialog
                detection={choice.detection}
                // DB 위치는 등록할 때만 정한다 (고쳐서 다시 배포할 때는 묻지 않는다)
                target={choice.existing ? undefined : place}
                deploymentMode={choice.existing ? undefined : mode}
                savedKeys={choice.existing?.envKeys}
                confirmLabel={
                  choice.existing ? t("고쳐서 다시 배포") : t("생성")
                }
                onCancel={() => {
                  setChoice(null);
                  input.current?.focus();
                }}
                onConfirm={(picked) => void confirm(picked)}
                redetect={(dir) =>
                  detectRepo(choice.repo, { ...choice.settings, rootDir: dir })
                }
              />
            )}
            {flowerAvailable && dashboardReady && (
              <p className="text-caption text-mute">
                {t("꽃을 누르면 대시보드로 이동해요.")}
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
                resetLabel={project ? t("내 프로젝트로") : undefined}
                actions={fallbackEntry}
              >
                {project && (
                  <>
                    <b className="font-semibold text-ink">{project.name}</b>{" "}
                    {t("프로젝트가 정상 배포됐어요.")}
                  </>
                )}
                {!project && state.result?.outcome === "succeeded" && (
                  <>
                    <b className="font-semibold text-ink">
                      {state.result.repo}
                    </b>
                    {t("가 피었어요.")}{" "}
                    {state.result.url ? (
                      <>
                        {t("주소는")}{" "}
                        <a
                          href={state.result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-ink underline"
                        >
                          {state.result.url.replace(/^https?:\/\//, "")}
                        </a>
                        {t("이고,")}{" "}
                      </>
                    ) : null}
                    {t("모니터링 화면에서 상태를 계속 볼 수 있어요.")}
                    {!!state.result.unsetKeys?.length && (
                      <span className="mt-2 block">
                        {t("값을 몰라 비워 둔 설정이 있어요:")}{" "}
                        <span className="break-all font-mono text-ink">
                          {state.result.unsetKeys.join(", ")}
                        </span>
                        {t(". 내 계정의 설정에서 넣으면 그 기능이 켜져요.")}
                      </span>
                    )}
                  </>
                )}
                {!finished && state.log && (
                  <span className="block break-all font-mono text-caption text-mute">
                    {state.log}
                  </span>
                )}
                {state.result?.outcome === "rolled-back" &&
                  (state.result.message ?? ROLLBACK_MESSAGE)}
                {state.result?.outcome === "failed" &&
                  (state.result.diagnosis && state.result.projectId ? (
                    <FixPanel
                      diagnosis={state.result.diagnosis}
                      onApply={applyFix}
                    />
                  ) : (
                    <>
                      {t(
                        state.result.message ??
                          "배포 서버가 이유를 남기지 않았어요.",
                      )}{" "}
                      {t("내 계정에서 설정을 고친 뒤 다시 배포할 수 있어요.")}
                    </>
                  ))}
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
          ? t("진입 권한을 확인하고 있어요.")
          : entry.busy
            ? t("대시보드로 이동 중입니다.")
            : entry.message}
      </p>
    </>
  );
}
