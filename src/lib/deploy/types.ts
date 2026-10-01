import type { Diagnosis } from "@/lib/projects/types";

export type RepoRef = string;
export type DeployResult = {
  repo: RepoRef;
  slug: string;
  outcome: "succeeded" | "rolled-back" | "failed";
  /** 실제 배포한 프로젝트. 접속 주소와 실패 이유 (lily-builder 결과) */
  projectId?: string;
  url?: string | null;
  message?: string | null;
  /** 실패했을 때 원인과 고칠 방법 */
  diagnosis?: Diagnosis | null;
};
export type FlowerTargets = { progress: number; wilt: number };
export type DeployEvent =
  | { type: "started"; repo: RepoRef }
  | { type: "stage"; index: number }
  | { type: "progress"; index: number; fraction: number }
  | { type: "threshold-exceeded" }
  /** builder 의 마지막 로그 한 줄 */
  | { type: "log"; line: string | null }
  | { type: "succeeded" | "rolled-back" | "failed"; result: DeployResult }
  | { type: "reset" };
export type DeployState = {
  phase:
    | "idle"
    | "running"
    | "threshold-exceeded"
    | "succeeded"
    | "rolled-back"
    | "failed";
  repo: RepoRef | null;
  index: number;
  fractions: number[];
  failedIndex: number | null;
  progress: number;
  wilt: number;
  result: DeployResult | null;
  /** 진행 중 builder 의 마지막 로그 한 줄 */
  log: string | null;
};
