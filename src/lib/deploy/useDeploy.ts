"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { DeploySettings } from "@/lib/projects/types";
import { deployReducer, initialDeployState } from "./deployReducer";
import { NeedLogin, realDeploy } from "./realDeploy";
import type { DeployResult, RepoRef } from "./types";

type Options = {
  onComplete?: (result: DeployResult) => void;
  /** 로그인하지 않았을 때. 화면이 로그인으로 보낸다 */
  onNeedLogin?: () => void;
};

export function useDeploy({ onComplete, onNeedLogin }: Options) {
  const [state, dispatch] = useReducer(
    deployReducer,
    undefined,
    initialDeployState,
  );
  const active = useRef<AbortController | null>(null);
  const callbacks = useRef({ onComplete, onNeedLogin });
  useEffect(() => {
    callbacks.current = { onComplete, onNeedLogin };
  }, [onComplete, onNeedLogin]);
  useEffect(() => () => active.current?.abort(), []);

  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    dispatch({ type: "reset" });
  }, []);
  const start = useCallback((repo: RepoRef, settings: DeploySettings = {}) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    realDeploy({
      repo,
      settings,
      signal: controller.signal,
      emit: (event) => {
        if (active.current !== controller) return;
        dispatch(event);
        if (
          event.type === "succeeded" ||
          event.type === "rolled-back" ||
          event.type === "failed"
        )
          callbacks.current.onComplete?.(event.result);
      },
    }).catch((error) => {
      if (active.current !== controller) return;
      active.current = null;
      dispatch({ type: "reset" });
      if (error instanceof NeedLogin) callbacks.current.onNeedLogin?.();
    });
  }, []);
  return { state, start, reset };
}
