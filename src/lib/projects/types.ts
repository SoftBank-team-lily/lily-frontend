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
/**
 * 온프레미스 앱의 DB 위치. local: 내 PC 에 에이전트가 띄운 DB, external: 이미 있는 DB 주소,
 * cloud: 클라우드 RDS 를 터널로 (데이터가 클라우드에 있다)
 */
export type DatabaseLocation = "local" | "external" | "cloud";
/** 배포 설정. 비어 있으면 lily-builder 가 레포를 보고 정한다 */
export type DeploySettings = {
  branch?: string;
  rootDir?: string;
  port?: number;
  healthPath?: string;
  env?: Record<string, string>;
  /** 등록할 때만 정한다. 비우면 builder 가 배포할 때 레포를 보고 정한다 */
  database?: DatabaseChoice;
  /** 온프레미스 DB 위치. 등록할 때만 정한다 */
  databaseLocation?: DatabaseLocation;
  /** databaseLocation 이 external 일 때 DB 주소 (비밀번호 포함, 돌려주지 않는다) */
  databaseUrl?: string;
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
/**
 * 클러스터에서 지금 앱 상태 (lily-builder /api/apps).
 * running: 트래픽 받는 Pod 가 모두 Ready, starting: 덜 떴거나 죽어 있음, stopped: 0 으로 내려 둠, absent: 클러스터에 없음
 */
export type AppState = "running" | "starting" | "stopped" | "absent";
export type AppRuntime = { state: AppState; ready: number; replicas: number };
/**
 * 에이전트(lily-on-premise CloudBurst)의 버스팅 단계.
 * STANDBY: 클라우드에 대기 배포 중, WARMING: 대기 Pod 를 띄워 닿기를 기다림, IDLE: 대기 Pod 가 닿아 비율만큼 넘기는 중,
 * SCALING: 대기 Pod 없이 과부하라 Pod 를 띄우는 중, OVERFLOWING: 과부하로 클라우드를 늘려 넘기는 중
 */
export type BurstPhase = "OFF" | "STANDBY" | "WARMING" | "IDLE" | "SCALING" | "OVERFLOWING";
/** 공개 주소(CNAME)가 가리키는 곳. MOVING_* 은 옮기는 중 */
export type HomePhase = "ONPREM" | "MOVING_TO_CLOUD" | "CLOUD" | "MOVING_TO_ONPREM" | "UNKNOWN";
/** 에이전트가 몇 초마다 보내는 상태 (builder /api/apps/{app}/burst) */
export type BurstLive = {
  /** builder 와 클라우드 Ingress 가 있어 켤 수 있다 (플랫폼 연결) */
  available: boolean;
  enabled: boolean;
  cloudPercent: number;
  phase: BurstPhase;
  /** 대기 Pod 가 닿아 넘길 수 있다 */
  warm: boolean;
  localActive: number;
  remoteActive: number;
  overflowedTotal: number;
  event: string;
  home: HomePhase;
  /** 거점을 옮길 수 있는 연결이 있다 */
  movable: boolean;
  homeEvent: string;
  /** 지금 앱 DB 위치 (local · cloud · external). DB 가 없거나 예전 에이전트면 비어 있다 */
  databaseMode?: string;
  /** 거점과 같이 DB 를 옮길 수 있다 (postgres, 내 PC 또는 RDS) */
  databaseMovable?: boolean;
  /** 지금 버스팅 단계에 들어온 시각 (epoch ms). 예전 에이전트면 없다 */
  phaseSince?: number;
  /** 진행 중이거나 마지막 버스팅 대기 배포의 빌드 id */
  standbyBuild?: string;
  /** 이번 거점 전환의 단계 순서 (STANDBY · COPY · PAUSE · DEPLOY · SCALE · DNS · VERIFY) */
  homeSteps?: string[];
  /** 지금 거점 전환 단계. 옮기는 중이 아니면 빈 문자열 */
  homeStep?: string;
  homeStepSince?: number;
  /** 거점 전환이 기다리는 클라우드 빌드 id */
  homeBuild?: string;
  /** 지금 취소하면 출발 거점으로 되돌린다 (주소를 바꾸기 전) */
  homeCancellable?: boolean;
  /** 내 PC 앱 컨테이너 CPU (코어 하나 기준 %). 예전 에이전트거나 모르면 없다 */
  homeCpuPercent?: number | null;
  homeMemoryMiB?: number | null;
  /** 컨테이너 한도(없으면 PC 메모리) 대비 % */
  homeMemoryPercent?: number | null;
  /** 내 PC 가 처리한 요청의 최근 5분 p95 (ms) */
  homeP95Ms?: number | null;
  localLimit?: number;
};
/** 에이전트가 기다리는 클라우드 빌드의 진행 (builder 빌드 기록) */
export type BuildProgress = {
  id: string;
  status: "QUEUED" | "BUILDING" | "DEPLOYING" | "SUCCEEDED" | "FAILED" | "ROLLED_BACK";
  /** 빌드 로그 마지막 줄 */
  line: string;
  createdAt: string;
  updatedAt: string;
};
/**
 * 온프레미스 앱의 버스팅. enabled·cloudPercent 는 화면에서 정한 값이고 live 는 에이전트가 보낸 지금 상태다.
 * agent: connected(상태를 받음) · waiting(붙었지만 아직 이 앱 상태가 없음) · outdated(버스팅을 모르는 판) · offline · unknown(확인 못 함)
 */
export type ProjectBurst = {
  enabled: boolean;
  cloudPercent: number;
  agent: "connected" | "waiting" | "outdated" | "offline" | "unknown" | "other";
  live: BurstLive | null;
  /** agent 가 other 일 때 에이전트가 지금 다루는 다른 앱 */
  agentApp?: string;
  /** standbyBuild: 버스팅 대기 배포, homeBuild: 거점 전환 대기 배포 */
  builds?: { standbyBuild?: BuildProgress; homeBuild?: BuildProgress };
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
  /** 온프레미스 앱의 DB 위치. 클라우드 프로젝트나 이 값 전에 등록한 프로젝트는 null */
  databaseLocation: DatabaseLocation | null;
  /** 등록할 때 고른 DB. null 이면 builder 가 레포를 보고 정한다 */
  database: DatabaseChoice | null;
  /** 클라우드에서 내 PC 로 옮긴 앱. 공개 주소는 클라우드 주소 그대로이고 되돌릴 수 있다 */
  movedFromCloud: boolean;
  /** 환경변수 이름만 돌려준다 (값은 비밀일 수 있다) */
  envKeys: string[];
  /** 값을 몰라 unset 으로 넣은 키. 넣으면 그 기능이 켜진다 */
  unsetKeys: string[];
  createdAt: string;
  /** 클러스터 앱 상태. 온프레미스이거나, 아직 보낸 적 없거나, 확인하지 못했으면 null */
  runtime: AppRuntime | null;
  /** 온프레미스 앱의 클라우드 버스팅·거점. 클라우드 프로젝트나 아직 배포한 적 없으면 null */
  burst: ProjectBurst | null;
  /** 온프레미스 앱의 클라우드 쪽 Pod (버스팅 대기·거점 전환용). 클라우드 앱이거나 확인 못 했으면 null */
  cloudPods: AppRuntime | null;
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
    /** 몇 번째 자동 재배포인지. 사용자가 시작한 배포면 0 */
    autoFixAttempt: number;
    /** onprem: 클라우드 앱을 내 PC 로 옮기는 배포 */
    move: "onprem" | null;
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
    autoFixAttempt: number;
    move: "onprem" | null;
  };
};
export type ProjectEntry = {
  project: ReadyProject;
  destination: string | null;
};
/** lily-cicd 의 스키마 이력. pgroll 은 마이그레이션 이름·active/complete/baseline, Flyway 는 버전·applied/failed */
export type SchemaEntry = {
  version: string | null;
  description: string | null;
  state: "active" | "complete" | "baseline" | "applied" | "failed";
  startedAt: string | null;
  completedAt: string | null;
};
/** 프로젝트 상세의 스키마 이력 패널. window 가 있으면 그 시각까지 스키마까지 롤백할 수 있다 */
export type ProjectSchema = {
  engine: "pgroll" | "flyway" | null;
  database: string | null;
  currentVersion: string | null;
  window: { migration: string; slot: string; completeAfter: string | null } | null;
  slots: {
    slot: string;
    schemaVersion: string | null;
    replicas: number;
    deployedAt: string | null;
    pgrollState: string | null;
  }[];
  history: SchemaEntry[];
  message: string | null;
};
