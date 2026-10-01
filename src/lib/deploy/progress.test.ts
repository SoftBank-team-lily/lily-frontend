import { describe, expect, it } from "vitest";
import { lastLine, stageIndex } from "./progress";

describe("배포 진행 단계", () => {
  it("builder 상태로 레포 확인과 빌드를 나눈다", () => {
    expect(stageIndex(null, [])).toBe(0);
    expect(stageIndex("QUEUED", ["queued: x"])).toBe(0);
    expect(stageIndex("BUILDING", ["build: kaniko job build-1"])).toBe(1);
  });

  it("배포 중에는 lily-cicd 진행 단계를 따른다", () => {
    const logs = ["build: pushed reg/app:t", "deploy: lily-cicd"];
    expect(stageIndex("DEPLOYING", logs)).toBe(2);
    logs.push("progress: deployment step2: applied deployment app-blue");
    expect(stageIndex("DEPLOYING", logs)).toBe(3);
    logs.push("progress: ready step3: deployment ready app-blue");
    expect(stageIndex("DEPLOYING", logs)).toBe(4);
    logs.push("progress: router app.apps.lilycloud.kr -> app-svc:80");
    expect(stageIndex("DEPLOYING", logs)).toBe(5);
  });

  it("마지막 로그 한 줄에서 분류를 뗀다", () => {
    expect(lastLine(["a", "progress: ready step3: deployment ready"])).toBe(
      "step3: deployment ready",
    );
    expect(lastLine([])).toBeNull();
  });
});
