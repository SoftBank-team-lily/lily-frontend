import type { HomePhase, ProjectBurst } from "./types";

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
    case "connected":
      return burst.live && !burst.live.available ? "플랫폼이 이 에이전트에 클라우드를 열어 주지 않았어요." : null;
  }
}

export const homeLabels: Record<HomePhase, string> = {
  ONPREM: "내 PC",
  MOVING_TO_CLOUD: "클라우드로 옮기는 중",
  CLOUD: "클라우드",
  MOVING_TO_ONPREM: "내 PC 로 옮기는 중",
  UNKNOWN: "알 수 없음",
};

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
