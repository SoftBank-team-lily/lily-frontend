export type DeploymentStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled-back";
/** 배포 위치. cloud: 플랫폼 클러스터, onprem: 사용자 PC 의 에이전트 */
export type DeployTarget = "cloud" | "onprem";
/** 배포 설정. 비어 있으면 lily-builder 가 레포를 보고 정한다 */
export type DeploySettings = {
  branch?: string;
  rootDir?: string;
  port?: number;
  healthPath?: string;
  env?: Record<string, string>;
};
export type Project = {
  id: string;
  repo: string;
  name: string;
  target: DeployTarget;
  /** 앱이 있는 하위 폴더. 레포 루트면 "" */
  rootDir: string;
  /** 배포 설정. null 이면 builder 가 레포를 보고 정한다 */
  branch: string | null;
  port: number | null;
  healthPath: string | null;
  /** 환경변수 이름만 돌려준다 (값은 비밀일 수 있다) */
  envKeys: string[];
  /** GitHub 웹훅 Secret. 본인 프로젝트 응답에서만 내려 준다 */
  webhookSecret: string;
  /** GitHub에 등록할 Payload URL. 서버 공개 주소가 없으면 빈 문자열 */
  webhookUrl: string;
  createdAt: string;
  /** url: 배포가 끝나 앱에 접속할 수 있는 주소, message: 결과 한 줄 (실패 이유) */
  latestDeployment: {
    id: string;
    status: DeploymentStatus;
    url: string | null;
    message: string | null;
    /** builder 단계 (QUEUED·BUILDING·DEPLOYING·…). 아직 보내기 전이면 null */
    stage: string | null;
    /** builder 로그 끝부분 */
    logs: string[];
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
  latestDeployment: {
    id: string;
    status: "succeeded";
    url: string | null;
    message: string | null;
    stage: string | null;
    logs: string[];
  };
};
export type ProjectEntry = {
  project: ReadyProject;
  destination: string | null;
};
