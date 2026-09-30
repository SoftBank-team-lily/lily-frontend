import type { DeployEvent, RepoRef } from "./types";
import {
  STAGES,
  STEPS,
  FAILURE_STAGE,
  FAILURE_STEP,
  ROLLBACK_DELAY,
  REDUCED_DELAY,
} from "./stages";
import { toSlug } from "@/lib/repo/toSlug";

type Options = {
  repo: RepoRef;
  fail: boolean;
  reducedMotion: boolean;
  signal: AbortSignal;
  emit: (event: DeployEvent) => void;
};

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function simulateDeploy({
  repo,
  fail,
  reducedMotion,
  signal,
  emit,
}: Options): Promise<void> {
  const pause = (ms: number) =>
    wait(reducedMotion ? Math.min(ms, REDUCED_DELAY) : ms, signal);
  try {
    signal.throwIfAborted();
    emit({ type: "started", repo });
    for (let index = 0; index < STAGES.length; index++) {
      emit({ type: "stage", index });
      for (let step = 1; step <= STEPS; step++) {
        await pause(STAGES[index].duration / STEPS);
        signal.throwIfAborted();
        emit({ type: "progress", index, fraction: step / STEPS });
        if (fail && index === FAILURE_STAGE && step === FAILURE_STEP) {
          emit({ type: "threshold-exceeded" });
          await pause(ROLLBACK_DELAY);
          signal.throwIfAborted();
          emit({
            type: "rolled-back",
            result: { repo, slug: toSlug(repo), outcome: "rolled-back" },
          });
          return;
        }
      }
    }
    emit({
      type: "succeeded",
      result: { repo, slug: toSlug(repo), outcome: "succeeded" },
    });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}
