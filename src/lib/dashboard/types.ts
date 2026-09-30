import type { DeployResult } from "@/lib/deploy/types";

export type DashboardEntry = {
  source: "flower";
  result: DeployResult & { outcome: "succeeded" };
};

export type DashboardHandler = (entry: DashboardEntry) => void | Promise<void>;
