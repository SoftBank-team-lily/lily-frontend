export type DeploymentStatus =
  "queued" | "running" | "succeeded" | "failed" | "rolled-back";
export type Project = {
  id: string;
  repo: string;
  name: string;
  createdAt: string;
  latestDeployment: { id: string; status: DeploymentStatus } | null;
};
export type Deployment = {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  createdAt: string;
  finishedAt: string | null;
};
export type ProjectPage = { items: Project[]; nextCursor: string | null };
export type ProjectEntry = { project: Project; destination: string | null };
