export type RepoRef = string;
export type DeployResult = { repo: RepoRef; slug: string; outcome: "succeeded" | "rolled-back" };
export type FlowerTargets = { progress: number; wilt: number };
export type DeployEvent =
  | { type: "started"; repo: RepoRef }
  | { type: "stage"; index: number }
  | { type: "progress"; index: number; fraction: number }
  | { type: "threshold-exceeded" }
  | { type: "succeeded" | "rolled-back"; result: DeployResult }
  | { type: "reset" };
export type DeployState = {
  phase: "idle" | "running" | "threshold-exceeded" | "succeeded" | "rolled-back";
  repo: RepoRef | null;
  index: number;
  fractions: number[];
  failedIndex: number | null;
  progress: number;
  wilt: number;
  result: DeployResult | null;
};
