"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { selectFlowerTargets } from "@/lib/deploy/deployReducer";
import { useDeploy } from "@/lib/deploy/useDeploy";
import { STAGES, REPO_ERROR, ROLLBACK_MESSAGE } from "@/lib/deploy/stages";
import type { DeployResult } from "@/lib/deploy/types";
import { parseRepo } from "@/lib/repo/parseRepo";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { DeployStatus } from "@/components/deploy/DeployStatus";
import { FlowerCanvas } from "@/components/flower/FlowerCanvas";
import { SiteNav } from "@/components/layout/SiteNav";
import { Reveal } from "@/components/layout/Reveal";
import { DeployForm } from "@/components/deploy/DeployForm";

export function LandingPage({
  onComplete,
}: {
  onComplete?: (result: DeployResult) => void;
}) {
  const [repo, setRepo] = useState("");
  const [fail, setFail] = useState(false);
  const [error, setError] = useState("");
  const nav = useRef<HTMLElement>(null);
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { state, start, reset } = useDeploy({ reducedMotion, onComplete });
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
  const finished = state.phase === "succeeded" || state.phase === "rolled-back";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const parsed = parseRepo(repo);
    if (!parsed) {
      setError(REPO_ERROR);
      input.current?.focus();
      return;
    }
    setError("");
    start(parsed, fail);
  }
  function restart() {
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
      />
      <SiteNav ref={nav} />
      <main className="relative z-1">
        <Reveal
          ref={section}
          id="deploy"
          className="mx-auto flex min-h-screen max-w-page flex-col items-center px-6 pt-[52vh] pb-[6vh] text-center"
        >
          <div className="max-w-lg break-keep text-shadow-halo">
            <h2 className="mb-[0.8rem] text-display font-semibold">
              지금 피워 보세요.
            </h2>
            <p className="text-lead text-mute">
              배포가 진행될수록 꽃에 색이 번져요. 이 화면은 시연용이라 실제
              배포는 일어나지 않아요.
            </p>
          </div>
          <DeployForm
            repo={repo}
            fail={fail}
            error={error}
            disabled={disabled}
            inputRef={input}
            onRepoChange={setRepo}
            onFailChange={setFail}
            onSubmit={submit}
          />
          {disabled && (
            <DeployStatus
              stage={stage}
              step={state.index + 1}
              fractions={state.fractions}
              failedIndex={state.failedIndex}
              finished={finished}
              onReset={restart}
            >
              {state.result?.outcome === "succeeded" && (
                <>
                  <b className="font-semibold text-ink">{state.result.repo}</b>
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
    </>
  );
}
