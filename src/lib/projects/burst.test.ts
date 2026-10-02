import { describe, expect, it } from "vitest";
import { burstBlocker, burstChanging, burstSummary, databaseMoveOffer } from "./burst";
import type { BurstLive, ProjectBurst } from "./types";

const live: BurstLive = {
  available: true,
  enabled: true,
  cloudPercent: 0,
  phase: "IDLE",
  warm: true,
  localActive: 0,
  remoteActive: 0,
  overflowedTotal: 0,
  event: "",
  home: "ONPREM",
  movable: true,
  homeEvent: "",
};
const burst = (value: Partial<ProjectBurst>, state: Partial<BurstLive> | null = {}): ProjectBurst => ({
  enabled: true,
  cloudPercent: 0,
  agent: "connected",
  live: state === null ? null : { ...live, ...state },
  ...value,
});

describe("거점 전환 DB 이전 선택지", () => {
  it("출발 쪽에 DB 가 있을 때만 묻는다", () => {
    const movable = { ...live, databaseMovable: true };
    expect(databaseMoveOffer({ ...movable, databaseMode: "local" }, "cloud")).toBe(true);
    expect(databaseMoveOffer({ ...movable, databaseMode: "local" }, "onprem")).toBe(false);
    expect(databaseMoveOffer({ ...movable, databaseMode: "cloud" }, "onprem")).toBe(true);
    expect(databaseMoveOffer({ ...movable, databaseMode: "cloud" }, "cloud")).toBe(false);
    expect(databaseMoveOffer({ ...movable, databaseMode: "external" }, "cloud")).toBe(false);
  });

  it("예전 에이전트나 옮길 수 없는 DB 면 묻지 않는다", () => {
    expect(databaseMoveOffer({ ...live, databaseMode: "local" }, "cloud")).toBe(false);
    expect(databaseMoveOffer({ ...live, databaseMode: "local", databaseMovable: false }, "cloud")).toBe(false);
    expect(databaseMoveOffer(null, "cloud")).toBe(false);
  });
});

describe("버스팅 표시", () => {
  it("꺼짐, 대기(0%), 분산 N% 로 요약한다", () => {
    expect(burstSummary(burst({ enabled: false })).title).toBe("꺼짐");
    expect(burstSummary(burst({})).title).toBe("대기 (클라우드 0%)");
    expect(burstSummary(burst({ cloudPercent: 30 }, { cloudPercent: 30 })).title).toBe("분산 (클라우드 30%)");
  });

  it("에이전트 단계를 풀어서 보여 준다", () => {
    expect(burstSummary(burst({}, { phase: "STANDBY", warm: false })).detail).toContain("대기 배포");
    expect(burstSummary(burst({}, { phase: "IDLE", warm: true })).detail).toContain("준비");
    expect(burstSummary(burst({}, { enabled: false })).detail).toContain("보내는 중");
    expect(burstSummary(burst({}, { phase: "OFF", home: "CLOUD" })).detail).toContain("클라우드");
    // 공개 주소가 클라우드면 분배 설정값(0%) 대신 실제로 클라우드가 다 받는다고 보인다
    expect(burstSummary(burst({}, { enabled: false, home: "CLOUD" })).title).toContain("클라우드 100%");
  });

  it("에이전트를 쓸 수 없으면 이유를 알려 준다", () => {
    expect(burstBlocker(burst({ agent: "offline" }, null))).toContain("연결돼 있지 않아요");
    expect(burstBlocker(burst({ agent: "outdated" }, null))).toContain("다시 실행");
    expect(burstBlocker(burst({}, { available: false }))).toContain("플랫폼");
    expect(burstBlocker(burst({}))).toBeNull();
  });

  it("설정이 반영되기 전이나 거점을 옮기는 동안은 다시 읽는다", () => {
    expect(burstChanging(burst({ enabled: false }, { enabled: false }))).toBe(false);
    expect(burstChanging(burst({ enabled: false }, { enabled: true }))).toBe(true);
    expect(burstChanging(burst({ enabled: false }, { enabled: false, home: "MOVING_TO_CLOUD" }))).toBe(true);
    expect(burstChanging(burst({}))).toBe(true);
    expect(burstChanging(null)).toBe(false);
  });
});
