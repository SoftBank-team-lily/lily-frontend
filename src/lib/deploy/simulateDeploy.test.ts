import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateDeploy } from "./simulateDeploy";
import {
  deployReducer,
  initialDeployState,
  selectFlowerTargets,
} from "./deployReducer";
import type { DeployEvent } from "./types";

describe("배포 타임라인", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function run(fail = false, reducedMotion = false) {
    const controller = new AbortController();
    const events: { event: DeployEvent; time: number }[] = [];
    const started = Date.now();
    const done = simulateDeploy({
      repo: "o/next.js",
      fail,
      reducedMotion,
      signal: controller.signal,
      emit: (event) => events.push({ event, time: Date.now() - started }),
    });
    return { controller, events, done };
  }
  it("12.4초에 성공하고 순서대로 진행한다", async () => {
    const { events, done } = run();
    await vi.runAllTimersAsync();
    await done;
    expect(events.at(-1)?.event.type).toBe("succeeded");
    // JS 타이머는 소수 ms를 절삭하므로 최대 1프레임 차이를 허용한다.
    expect(events.at(-1)?.time).toBeCloseTo(12400, -2);
    const state = events.reduce(
      (state, { event }) => deployReducer(state, event),
      initialDeployState(),
    );
    expect(state.fractions).toEqual([1, 1, 1, 1, 1, 1]);
    expect(selectFlowerTargets(state)).toEqual({ progress: 1, wilt: 0 });
    const progress = events.filter(({ event }) => event.type === "progress");
    expect(progress).toHaveLength(72);
    progress.forEach(({ event }, i) => {
      if (event.type === "progress")
        expect((event.index + event.fraction) / 6).toBeCloseTo((i + 1) / 72);
    });
  });
  it("5단계 7스텝에서 시든 뒤 롤백한다", async () => {
    const { events, done } = run(true);
    await vi.runAllTimersAsync();
    await done;
    expect(
      events.find(({ event }) => event.type === "threshold-exceeded")?.time,
    ).toBeCloseTo(9717, -2);
    expect(events.at(-1)?.time).toBeCloseTo(11117, -2);
    let state = initialDeployState();
    for (const { event } of events) {
      state = deployReducer(state, event);
      if (event.type === "threshold-exceeded") expect(state.wilt).toBe(1);
    }
    expect(state.phase).toBe("rolled-back");
    expect(state.fractions[4]).toBe(7 / 12);
    expect(selectFlowerTargets(state)).toEqual({
      progress: (4 + 7 / 12) / 6,
      wilt: 0.85,
    });
    expect(deployReducer(state, { type: "reset" })).toEqual(
      initialDeployState(),
    );
  });
  it("reduced motion은 롤백 대기를 300ms로 줄인다", async () => {
    const { events, done } = run(true, true);
    await vi.runAllTimersAsync();
    await done;
    const threshold = events.find(
      ({ event }) => event.type === "threshold-exceeded",
    )!;
    expect(events.at(-1)!.time - threshold.time).toBe(300);
  });
  it("취소 후 이벤트와 타이머가 남지 않는다", async () => {
    const { events, done, controller } = run();
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    const count = events.length;
    await vi.runAllTimersAsync();
    await done;
    expect(events).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });
});
