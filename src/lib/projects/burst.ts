import type { AppRuntime, BuildProgress, BurstLive, HomePhase, Project, ProjectBurst } from "./types";

/** 버스팅 한 줄 요약: 꺼짐 · 대기(0%) · 분산 N% 와 지금 단계 */
export function burstSummary(burst: ProjectBurst): { title: string; detail: string | null } {
  if (!burst.enabled) return { title: "꺼짐", detail: null };
  const title = burst.cloudPercent === 0 ? "대기 (클라우드 0%)" : `분산 (클라우드 ${burst.cloudPercent}%)`;
  const live = burst.live;
  if (!live) return { title, detail: null };
  if (!live.enabled) return { title, detail: "에이전트에 설정을 보내는 중" };
  switch (live.phase) {
    case "OFF":
      return { title, detail: live.home === "CLOUD" ? "거점이 클라우드라 쉬는 중" : "다음 배포부터 대기 배포해요" };
    case "STANDBY":
      return { title, detail: "클라우드에 대기 배포 중 (몇 분 걸려요)" };
    case "WARMING":
      return { title, detail: "대기 Pod 를 띄우는 중" };
    case "IDLE":
      return {
        title,
        detail: live.warm ? "대기 Pod 1대가 받을 준비가 됐어요" : "대기 Pod 없이 넘칠 때만 띄워요",
      };
    case "SCALING":
      return { title, detail: "과부하: 클라우드 Pod 를 늘리는 중" };
    case "OVERFLOWING":
      return { title, detail: "과부하: 넘치는 요청을 클라우드로 보내는 중" };
  }
}

/** 에이전트를 쓸 수 없을 때의 안내. 쓸 수 있으면 null */
export function burstBlocker(burst: ProjectBurst): string | null {
  switch (burst.agent) {
    case "offline":
      return "내 PC 에이전트가 연결돼 있지 않아요.";
    case "outdated":
      return "에이전트가 예전 판이에요. 연결 명령으로 에이전트를 다시 실행하면 쓸 수 있어요.";
    case "waiting":
      return "에이전트 상태를 기다리는 중이에요.";
    case "unknown":
      return null;
    case "other":
      return `내 PC 에이전트가 지금 다른 앱(${burst.agentApp})을 돌리고 있어요. 에이전트는 앱 하나만 다뤄서 이 앱 상태를 받을 수 없어요.`;
    case "connected":
      return burst.live && !burst.live.available ? "플랫폼이 이 에이전트에 클라우드를 열어 주지 않았어요." : null;
  }
}

export const homeLabels: Record<HomePhase, string> = {
  ONPREM: "내 PC",
  MOVING_TO_CLOUD: "온프레미스 → 클라우드 전환 중",
  CLOUD: "클라우드",
  MOVING_TO_ONPREM: "클라우드 → 온프레미스 전환 중",
  UNKNOWN: "알 수 없음",
};

/**
 * 거점을 옮길 때 DB 도 옮길지 물어야 한다. 클라우드로 갈 때 DB 가 내 PC 에 있거나, 내 PC 로 올 때 DB 가 RDS 에 있으면
 */
export function databaseMoveOffer(live: BurstLive | null, target: "cloud" | "onprem"): boolean {
  if (!live?.databaseMovable) return false;
  return target === "cloud" ? live.databaseMode === "local" : live.databaseMode === "cloud";
}

/** 상태가 곧 바뀌어서 목록을 다시 읽어야 한다 */
export function burstChanging(burst: ProjectBurst | null): boolean {
  if (!burst) return false;
  const live = burst.live;
  if (burst.agent === "waiting") return true;
  if (!live) return false;
  if (live.home.startsWith("MOVING")) return true;
  if (live.enabled !== burst.enabled || live.cloudPercent !== burst.cloudPercent) return true;
  // 켜져 있으면 처리 중인 요청 수와 단계가 계속 바뀐다
  return burst.enabled;
}

/** 거점 전환 단계 이름 (에이전트 HomeCutover step) */
export const homeStepLabels: Record<string, string> = {
  STANDBY: "클라우드 빌드·배포",
  COPY: "DB 복사",
  PAUSE: "쓰기 멈춤",
  DEPLOY: "내 PC 배포",
  SCALE: "클라우드 Pod 준비",
  DNS: "주소 전환",
  VERIFY: "공개 확인",
};

/** 클라우드 빌드 상태별로 그 단계 안에서 얼마나 왔는지 (대략) */
const BUILD_SHARE: Record<BuildProgress["status"], number> = {
  QUEUED: 0.1,
  BUILDING: 0.4,
  DEPLOYING: 0.8,
  SUCCEEDED: 1,
  FAILED: 1,
  ROLLED_BACK: 1,
};

export type Activity = {
  /** home: 공개 주소 옮기기, standby: 버스팅 대기 배포 */
  kind: "home" | "standby";
  title: string;
  steps: string[];
  /** 지금 단계 (steps 의 위치) */
  current: number;
  /** 0~100. 단계 수와 클라우드 빌드 상태로 어림한다 */
  percent: number;
  /** 지금 단계에 들어온 시각 (epoch ms). 모르면 null */
  since: number | null;
  /** 클라우드 빌드 상태와 로그 마지막 줄. 기다리는 빌드가 없으면 null */
  build: { status: string; line: string } | null;
  /** 지금 취소할 수 있다 */
  cancellable: boolean;
  /** 취소할 수 없을 때 이유 */
  lockedReason: string | null;
};

const BUILD_LABELS: Record<BuildProgress["status"], string> = {
  QUEUED: "대기열",
  BUILDING: "이미지 빌드 중",
  DEPLOYING: "클러스터에 배포 중",
  SUCCEEDED: "끝남",
  FAILED: "실패",
  ROLLED_BACK: "되돌림",
};

/**
 * 지금 진행 중인 일 (거점 전환, 버스팅 대기 배포). 화면이 단계·진행률·경과 시간을 그린다.
 * 둘은 서로 막히지만, 예전 에이전트나 막기 전에 시작한 일이면 둘 다 돌 수 있어 목록으로 준다.
 */
export function activities(burst: ProjectBurst | null): Activity[] {
  const live = burst?.live;
  if (!live) return [];
  const found: Activity[] = [];
  if (live.home === "MOVING_TO_CLOUD" || live.home === "MOVING_TO_ONPREM") {
    const steps = live.homeSteps?.length ? live.homeSteps : [];
    const current = Math.max(0, steps.indexOf(live.homeStep ?? ""));
    const build = live.homeStep === "STANDBY" ? burst?.builds?.homeBuild : undefined;
    const share = build ? BUILD_SHARE[build.status] : 0.5;
    found.push({
      kind: "home",
      title: live.home === "MOVING_TO_CLOUD" ? "온프레미스 → 클라우드 전환 중" : "클라우드 → 온프레미스 전환 중",
      steps: steps.map((step) => homeStepLabels[step] ?? step),
      current,
      percent: steps.length ? Math.min(99, Math.round(((current + share) / steps.length) * 100)) : 0,
      since: live.homeStepSince || null,
      build: build ? { status: BUILD_LABELS[build.status], line: build.line } : null,
      cancellable: Boolean(live.homeCancellable),
      lockedReason: live.homeCancellable ? null : "공개 주소를 바꾸는 단계라 취소할 수 없어요. 끝난 뒤 반대로 옮겨 주세요.",
    });
  }
  if (live.phase === "STANDBY" || live.phase === "WARMING") {
    const build = burst?.builds?.standbyBuild;
    const steps = ["클라우드 빌드", "클러스터에 배포", "대기 Pod 준비"];
    const current = live.phase === "WARMING" ? 2 : build?.status === "DEPLOYING" ? 1 : 0;
    const share = live.phase === "WARMING" ? 0.5 : build ? (build.status === "DEPLOYING" ? 0.5 : BUILD_SHARE[build.status]) : 0.2;
    found.push({
      kind: "standby",
      title: "버스팅: 클라우드에 대기 배포하는 중",
      steps,
      current,
      percent: Math.min(99, Math.round(((current + share) / steps.length) * 100)),
      since: live.phaseSince || null,
      build: build && live.phase === "STANDBY" ? { status: BUILD_LABELS[build.status], line: build.line } : null,
      cancellable: true,
      lockedReason: null,
    });
  }
  return found;
}

/** 버스팅 켜기·끄기·비율을 지금 바꿀 수 없는 이유. 바꿀 수 있으면 null */
export function burstLock(burst: ProjectBurst): string | null {
  const home = burst.live?.home;
  if (home === "MOVING_TO_CLOUD" || home === "MOVING_TO_ONPREM")
    return "공개 주소 전환 중이라 버스팅을 바꿀 수 없어요. 끝나거나 전환을 취소하면 바꿀 수 있어요.";
  return null;
}

/** 거점을 지금 옮길 수 없는 이유. 옮길 수 있으면 null */
export function homeLock(burst: ProjectBurst): string | null {
  if (burst.live?.phase === "STANDBY")
    return "버스팅 대기 배포가 진행 중이라 옮길 수 없어요. 끝나거나 대기 배포를 취소하면 옮길 수 있어요.";
  return null;
}

/** 경과 시간 "3분 12초" */
export function elapsed(since: number | null, now: number): string | null {
  if (!since) return null;
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}분 ${seconds % 60}초` : `${seconds}초`;
}

export type Overview = {
  /** 공개 주소를 지금 받는 곳 */
  home: { label: string; tone: "ink" | "warning" | "mute" };
  pc: string;
  cloud: string;
  database: string;
  burst: string;
  /** 바로 손봐야 할 것. idle: 쓰이지 않는 클라우드 Pod (내릴 수 있다) */
  warnings: { text: string; tone: "warning" | "danger"; action?: "stopCloud" }[];
  /** 에이전트가 남긴 마지막 기록 */
  recent: string[];
};

/** 온프레미스 앱의 지금 상태를 한눈에 (공개 주소가 어디서 받는지, 내 PC·클라우드에 뭐가 떠 있는지, 손볼 것) */
export function overview(project: Pick<Project, "burst" | "cloudPods" | "databaseLocation">): Overview | null {
  const burst = project.burst;
  if (!burst) return null;
  const live = burst.live;
  const pods = project.cloudPods;
  const home = live?.home ?? null;
  const warnings: Overview["warnings"] = [];
  const moving = home === "MOVING_TO_CLOUD" || home === "MOVING_TO_ONPREM";

  const homeLabel = !live
    ? { label: "확인 못 함", tone: "mute" as const }
    : moving
      ? { label: home === "MOVING_TO_CLOUD" ? "온프레미스 → 클라우드 전환 중" : "클라우드 → 온프레미스 전환 중", tone: "warning" as const }
      : home === "CLOUD"
        ? { label: "클라우드", tone: "ink" as const }
        : home === "ONPREM"
          ? { label: "내 PC", tone: "ink" as const }
          : { label: "알 수 없음", tone: "warning" as const };

  const pc =
    burst.agent === "connected"
      ? home === "CLOUD"
        ? "에이전트 연결됨 · 이 앱은 쉬는 중 (공개 주소가 클라우드)"
        : "에이전트 연결됨 · 이 앱 실행 중"
      : burst.agent === "other"
        ? `에이전트가 다른 앱(${burst.agentApp})을 돌리는 중`
        : burst.agent === "offline"
          ? "에이전트 연결 안 됨"
          : burst.agent === "outdated"
            ? "에이전트가 예전 판"
            : burst.agent === "waiting"
              ? "에이전트 상태를 기다리는 중"
              : "확인 못 함";

  const cloud = podsLabel(pods);
  const database =
    project.databaseLocation === "local"
      ? "내 PC"
      : project.databaseLocation === "cloud"
        ? "클라우드(RDS)"
        : project.databaseLocation === "external"
          ? "기존 DB 서버"
          : "없음";
  const burstText = burstSummary(burst);

  if (home === "CLOUD" && pods && pods.ready === 0)
    warnings.push({ text: "공개 주소가 클라우드인데 준비된 클라우드 Pod 가 없어요. 앱이 응답하지 않을 수 있어요.", tone: "danger" });
  if (home === "ONPREM" && !burst.enabled && pods && pods.replicas > 0)
    warnings.push({
      text: `클라우드 Pod ${pods.replicas}대가 쓰이지 않고 떠 있어요 (끊긴 전환이나 꺼진 버스팅이 남긴 것).`,
      tone: "warning",
      action: "stopCloud",
    });
  if (burst.agent === "other")
    warnings.push({
      text: `내 PC 에이전트가 다른 앱(${burst.agentApp})을 돌리고 있어서 이 앱의 버스팅·전환을 쓸 수 없어요.`,
      tone: "warning",
    });
  if (activities(burst).length > 1)
    warnings.push({ text: "버스팅 대기 배포와 전환이 같이 돌고 있어요. 하나를 취소해 주세요.", tone: "danger" });

  const recent = [live?.homeEvent, live?.event?.replace(/^\S+Z /, "")].filter((line): line is string => Boolean(line));
  return {
    home: homeLabel,
    pc,
    cloud,
    database,
    burst: burstText.detail ? `${burstText.title} · ${burstText.detail}` : burstText.title,
    warnings,
    recent,
  };
}

function podsLabel(pods: AppRuntime | null): string {
  if (!pods) return "확인 못 함";
  if (pods.state === "absent") return "배포 없음";
  if (pods.replicas === 0) return "Pod 0대 (내려 둠)";
  return `Pod ${pods.ready}/${pods.replicas} 준비됨`;
}
