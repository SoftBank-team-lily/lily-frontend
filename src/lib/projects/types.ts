export type DeploymentStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled-back";
/** 배포 위치. cloud: 플랫폼 클러스터, onprem: 사용자 PC 의 에이전트 */
export type DeployTarget = "cloud" | "onprem";
export type Project = {
  id: string;
  repo: string;
  name: string;
  target: DeployTarget;
  createdAt: string;
  /** url: 배포가 끝나 앱에 접속할 수 있는 주소 */
  latestDeployment: {
    id: string;
    status: DeploymentStatus;
    url: string | null;
  } | null;
};
export type Deployment = {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  createdAt: string;
  finishedAt: string | null;
};
export type ProjectPage = { items: Project[]; nextCursor: string | null };
export type ReadyProject = Omit<Project, "latestDeployment"> & {
  latestDeployment: { id: string; status: "succeeded"; url: string | null };
};
export type ProjectEntry = {
  project: ReadyProject;
  destination: string | null;
};
