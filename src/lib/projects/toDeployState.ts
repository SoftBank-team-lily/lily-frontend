import type { DeployState } from "@/lib/deploy/types";
import { STAGES } from "@/lib/deploy/stages";
import { toSlug } from "@/lib/repo/toSlug";
import type { ReadyProject } from "./types";

export function toDeployState(project: ReadyProject): DeployState {
  return {
    phase: "succeeded",
    repo: project.repo,
    index: STAGES.length - 1,
    fractions: STAGES.map(() => 1),
    failedIndex: null,
    progress: 1,
    wilt: 0,
    log: null,
    result: {
      repo: project.repo,
      slug: toSlug(project.repo),
      outcome: "succeeded",
    },
  };
}
