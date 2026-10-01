/** 내 PC 에이전트 연결 상태. 에이전트를 만든 적이 없으면 null */
export type AgentState = {
  connected: boolean;
  /** 에이전트가 알려 준 이름 (PC 호스트 이름) */
  agentId: string | null;
  /** DB 터널이 있어 DB 가 필요한 앱도 띄울 수 있다 */
  database: boolean;
} | null;

/** 새로 발급한 토큰. 이때만 보인다 */
export type AgentIssued = { token: string };
