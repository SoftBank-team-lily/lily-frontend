"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { deployReducer, initialDeployState } from "./deployReducer";
import { simulateDeploy } from "./simulateDeploy";
import type { DeployResult, RepoRef } from "./types";

type Options = {
  reducedMotion: boolean;
  onComplete?: (result: DeployResult) => void;
};

export function useDeploy({ reducedMotion, onComplete }: Options) {
  const [state, dispatch] = useReducer(
    deployReducer,
    undefined,
    initialDeployState,
  );
  const active = useRef<AbortController | null>(null);
  const complete = useRef(onComplete);
  useEffect(() => {
    complete.current = onComplete;
  }, [onComplete]);
  useEffect(() => () => active.current?.abort(), []);

  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    dispatch({ type: "reset" });
  }, []);
  const start = useCallback(
    (repo: RepoRef, fail: boolean) => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      void simulateDeploy({
        repo,
        fail,
        reducedMotion,
        signal: controller.signal,
        emit: (event) => {
          if (active.current !== controller) return;
          dispatch(event);
          if (event.type === "succeeded" || event.type === "rolled-back")
            complete.current?.(event.result);
        },
      });
    },
    [reducedMotion],
  );
  return { state, start, reset };
}
