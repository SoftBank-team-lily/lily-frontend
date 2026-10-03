export const fixStages = ["accepted", "drafting", "checking", "opening-pr", "review"] as const;
export type FixStage = (typeof fixStages)[number];
export type FixRun = {
  id: string;
  deploymentId: string;
  sourceCommit: string;
  stage: FixStage;
  status: "running" | "review" | "skipped" | "failed";
  reasonCode: string | null;
  files: string[];
  events: { stage: FixStage; at: string }[];
  prUrl: string | null;
  startedAt: string;
  updatedAt: string;
};
export type FixProgress = {
  enabled: boolean;
  consent: boolean;
  githubApp: boolean;
  runs: FixRun[];
};
