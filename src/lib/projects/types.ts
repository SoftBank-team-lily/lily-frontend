export type DeploymentStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled-back";
/** 배포 위치. cloud: 플랫폼 클러스터, onprem: 사용자 PC 의 에이전트 */
export type DeployTarget = "cloud" | "onprem";
/** 앱 DB. none: DB 없이 배포 */
export type DatabaseChoice = "postgres" | "mysql" | "none";
/** 배포 설정. 비어 있으면 lily-builder 가 레포를 보고 정한다 */
export type DeploySettings = {
  branch?: string;
  rootDir?: string;
  port?: number;
  healthPath?: string;
  env?: Record<string, string>;
  /** 등록할 때만 정한다. 비우면 builder 가 배포할 때 레포를 보고 정한다 */
  database?: DatabaseChoice;
  /** 서버가 랜덤 값을 만들어 넣을 환경변수 (JWT 서명 키 같은 앱 내부 비밀값) */
  generateEnv?: string[];
  /** 같은 레포의 다른 프로젝트에 저장된 값을 가져올 환경변수 */
  reuseEnv?: string[];
};
/** 설정 키를 채우는 방법. GENERATE: 서버가 랜덤 값, DEFAULT: value 를 넣는다, INPUT: 사용자만 아는 값 */
export type ConfigKind = "GENERATE" | "DEFAULT" | "INPUT";
/** lily-builder 가 레포에서 찾은, 앱이 기동할 때 읽는 설정 키 */
export type ConfigAdvice = {
  env: string;
  property: string | null;
  kind: ConfigKind;
  value: string | null;
  hint: string;
  /** 없으면 앱이 뜨지 않는다 */
  required: boolean;
  source: string;
  /** 같은 레포의 다른 프로젝트에 이미 값이 있다 (값은 서버에서만 옮긴다) */
  reusable?: boolean;
};
/** 레포 루트에 앱이 없을 때 최상위 앱 폴더 후보. client: 서버로 띄울 수 없는 앱 종류 (electron 등) */
export type AppCandidate = { dir: string; stack: string; client: string | null };
/** 배포 전 감지 결과 */
export type Detection = {
  database: DatabaseChoice;
  /** 실제로 본 앱 폴더. 레포 루트면 null */
  dir: string | null;
  apps: AppCandidate[];
  config: ConfigAdvice[];
  /** 폴더를 하나로 정하지 못했을 때 이유 */
  problem: string | null;
};
/** 실패를 고칠 방법 하나 */
export type DeployFix = {
  type: "env" | "port" | "database" | "healthPath" | "rootDir";
  env: string | null;
  kind: ConfigKind;
  value: string | null;
  hint: string | null;
  options: string[];
  /** 사용자에게 묻지 않고 고칠 수 있다 */
  auto: boolean;
};
/** 실패한 배포의 원인과 고칠 방법 (lily-builder FailureDiagnoser) */
export type Diagnosis = {
  cause: string;
  fixes: DeployFix[];
  source: "rule" | "ai";
  autoFixable: boolean;
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
    /** 실패했을 때 원인과 고칠 방법. 그 외 null */
    diagnosis: Diagnosis | null;
    /** 실행기가 이전 실패를 자동으로 고쳐 다시 보낸 배포 */
    autoFixed: boolean;
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
    diagnosis: Diagnosis | null;
    autoFixed: boolean;
  };
};
export type ProjectEntry = {
  project: ReadyProject;
  destination: string | null;
};
