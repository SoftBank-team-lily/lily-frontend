import type { DeployEvent, DeployState, FlowerTargets } from "./types";
import { STAGES } from "./stages";

export function initialDeployState(): DeployState {
  return {
    phase: "idle",
    repo: null,
    index: 0,
    fractions: STAGES.map(() => 0),
    failedIndex: null,
    progress: 0,
    wilt: 0,
    result: null,
  };
}

export function deployReducer(
  state: DeployState,
  event: DeployEvent,
): DeployState {
  switch (event.type) {
    case "reset":
      return initialDeployState();
    case "started":
      return { ...initialDeployState(), phase: "running", repo: event.repo };
    case "stage":
      return { ...state, index: event.index };
    case "progress":
      return {
        ...state,
        fractions: state.fractions.map((fraction, index) =>
          index === event.index ? event.fraction : fraction,
        ),
        progress: (event.index + event.fraction) / STAGES.length,
      };
    case "threshold-exceeded":
      return { ...state, phase: event.type, failedIndex: state.index, wilt: 1 };
    case "succeeded":
      return { ...state, phase: event.type, result: event.result };
    case "rolled-back":
      return { ...state, phase: event.type, result: event.result, wilt: 0.85 };
  }
}

export function selectFlowerTargets(state: DeployState): FlowerTargets {
  return { progress: state.progress, wilt: state.wilt };
}
