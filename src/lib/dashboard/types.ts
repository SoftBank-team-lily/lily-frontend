import type { DeployResult } from "@/lib/deploy/types";

export type DashboardEntry = {
  source: "flower";
  result: DeployResult & { outcome: "succeeded" };
  projectId?: string;
};

export type EntryCheck =
  { allowed: true } | { allowed: false; message?: string };

export type DashboardHandler = (entry: DashboardEntry) => void | Promise<void>;
