import { describe, expect, it } from "vitest";
import { activities, burstLock, elapsed, homeLock } from "./burst";
import type { BurstLive, ProjectBurst } from "./types";

const LIVE: BurstLive = {
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

function burst(live: Partial<BurstLive>, builds: ProjectBurst["builds"] = {}): ProjectBurst {
  return { enabled: true, cloudPercent: 0, agent: "connected", live: { ...LIVE, ...live }, builds };
}

describe("진행 중인 일 (버스팅 대기 배포·거점 전환)", () => {
  it("한가하면 아무것도 없고 서로 막지 않는다", () => {
    const value = burst({});
    expect(activities(value)).toEqual([]);
    expect(burstLock(value)).toBeNull();
    expect(homeLock(value)).toBeNull();
  });

  it("거점 전환은 단계·진행률·클라우드 빌드 상태를 보이고, 그동안 버스팅을 막는다", () => {
    const value = burst(
      {
        home: "MOVING_TO_CLOUD",
        homeSteps: ["STANDBY", "SCALE", "DNS", "VERIFY"],
        homeStep: "STANDBY",
        homeStepSince: 1_000,
        homeBuild: "b1",
        homeCancellable: true,
      },
      { homeBuild: { id: "b1", status: "BUILDING", line: "build: kaniko job build-b1", createdAt: "", updatedAt: "" } },
    );
    const [home] = activities(value);
    expect(home).toMatchObject({
      kind: "home",
      steps: ["클라우드 빌드·배포", "클라우드 Pod 준비", "주소 전환", "공개 확인"],
      current: 0,
      percent: 10,
      cancellable: true,
      build: { status: "이미지 빌드 중", line: "build: kaniko job build-b1" },
    });
    expect(burstLock(value)).toContain("공개 주소를 옮기는 중");
  });

  it("주소를 바꾸는 단계부터는 취소할 수 없다고 알린다", () => {
    const [home] = activities(
      burst({ home: "MOVING_TO_ONPREM", homeSteps: ["DEPLOY", "DNS", "VERIFY"], homeStep: "DNS", homeCancellable: false }),
    );
    expect(home.current).toBe(1);
    expect(home.percent).toBe(50);
    expect(home.cancellable).toBe(false);
    expect(home.lockedReason).toContain("취소할 수 없어요");
  });

  it("버스팅 대기 배포는 빌드 → 배포 → 대기 Pod 순서로 보이고, 그동안 거점 전환을 막는다", () => {
    const building = burst(
      { phase: "STANDBY", phaseSince: 2_000, standbyBuild: "s1" },
      { standbyBuild: { id: "s1", status: "DEPLOYING", line: "deploy: lily-cicd", createdAt: "", updatedAt: "" } },
    );
    expect(activities(building)[0]).toMatchObject({ kind: "standby", current: 1, percent: 50, cancellable: true });
    expect(homeLock(building)).toContain("대기 배포가 진행 중");

    const warming = activities(burst({ phase: "WARMING" }))[0];
    expect(warming.current).toBe(2);
    expect(warming.build).toBeNull();
    expect(homeLock(burst({ phase: "WARMING" }))).toBeNull();
  });

  it("둘이 같이 돌면 둘 다 보인다", () => {
    const both = activities(burst({ phase: "STANDBY", home: "MOVING_TO_CLOUD", homeSteps: ["STANDBY"], homeStep: "STANDBY" }));
    expect(both.map((item) => item.kind)).toEqual(["home", "standby"]);
  });

  it("경과 시간을 분·초로 쓴다", () => {
    expect(elapsed(null, 10_000)).toBeNull();
    expect(elapsed(1_000, 46_000)).toBe("45초");
    expect(elapsed(1_000, 193_000)).toBe("3분 12초");
  });
});
