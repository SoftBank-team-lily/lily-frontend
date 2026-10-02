import { describe, expect, it } from "vitest";
import { activities, burstLock, elapsed, homeLock, overview } from "./burst";
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
    expect(burstLock(value)).toContain("공개 주소 전환 중");
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

describe("지금 상태 한눈에", () => {
  it("공개 주소가 어디서 받는지와 내 PC·클라우드·DB·버스팅을 쓴다", () => {
    const view = overview({
      burst: { ...burst({ home: "CLOUD", event: "2026-10-02T02:51:59Z park: home is cloud", homeEvent: "home: cloud" }) },
      cloudPods: { state: "running", ready: 2, replicas: 2 },
      databaseLocation: "cloud",
    })!;
    expect(view.home).toEqual({ label: "클라우드", tone: "ink" });
    expect(view.pc).toContain("쉬는 중");
    expect(view.cloud).toBe("Pod 2/2 준비됨");
    expect(view.database).toBe("클라우드(RDS)");
    expect(view.warnings).toEqual([]);
    expect(view.recent).toEqual(["home: cloud", "park: home is cloud"]);
  });

  it("공개 주소가 내 PC 인데 버스팅도 꺼져 있으면 남은 클라우드 Pod 를 내리라고 한다", () => {
    const view = overview({
      burst: { ...burst({ home: "ONPREM" }), enabled: false },
      cloudPods: { state: "running", ready: 2, replicas: 2 },
      databaseLocation: null,
    })!;
    expect(view.home.label).toBe("내 PC");
    expect(view.warnings).toEqual([expect.objectContaining({ action: "stopCloud", tone: "warning" })]);
  });

  it("공개 주소가 클라우드인데 Pod 가 없으면 위험을 알린다", () => {
    const view = overview({
      burst: burst({ home: "CLOUD" }),
      cloudPods: { state: "stopped", ready: 0, replicas: 0 },
      databaseLocation: null,
    })!;
    expect(view.warnings[0].tone).toBe("danger");
    expect(view.cloud).toBe("Pod 0대 (내려 둠)");
  });

  it("에이전트가 다른 앱을 돌리면 그 앱 이름을 알린다", () => {
    const view = overview({
      burst: { enabled: false, cloudPercent: 0, agent: "other", agentApp: "dbmove-blog", live: null },
      cloudPods: null,
      databaseLocation: null,
    })!;
    expect(view.home.label).toBe("확인 못 함");
    expect(view.pc).toContain("dbmove-blog");
    expect(view.warnings[0].text).toContain("dbmove-blog");
  });
});
