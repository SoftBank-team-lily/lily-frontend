import { describe, expect, it } from "vitest";
import { buildSettings, runOnce, type BuildState, type FinalStatus, type Move, type MoveOutcome, type RunDeps, type RunResult } from "./run";

// 클라우드 앱을 내 PC 로 옮기는 배포 (deployments.move = onprem)

const PROJECT = "1b62c0de-0000-4000-8000-000000000001";
const APP = "book-club-1b62c0";

type Calls = string[];

function fake(move: Move, outcome: MoveOutcome = { ok: true, url: "https://book-club-1b62c0.apps.lilycloud.kr" }) {
  const calls: Calls = [];
  const results = new Map<string, RunResult>();
  let status: "queued" | "running" | FinalStatus = "queued";
  let buildId: string | null = null;
  let builder: BuildState = { status: "BUILDING", url: null, message: null };
  const deps: RunDeps & { calls: Calls; results: Map<string, RunResult>; finish(state: BuildState): void } = {
    calls,
    results,
    finish(state) {
      builder = state;
    },
    allowedOwners: [],
    maxActive: 2,
    async enqueueNewProjects() {
      return 0;
    },
    async pending() {
      return status === "queued" && !buildId
        ? [
            {
              deploymentId: "d1",
              projectId: PROJECT,
              repo: "a/book-club",
              target: "onprem" as const,
              agentKey: "a1b2c3d4e5f6",
              appName: APP,
              move,
              settings: {
                database: "postgres" as const,
                ...(move.database
                  ? { databaseLocation: move.database, importDatabase: move.database === "local" }
                  : {}),
              },
            },
          ]
        : [];
    },
    async active() {
      return buildId && (status === "queued" || status === "running")
        ? [{ deploymentId: "d1", status, buildId, move: { ...move, appName: APP } }]
        : [];
    },
    async saveRun(_deploymentId, id, app) {
      buildId = id;
      calls.push(`run ${app}`);
    },
    async saveResult(deploymentId, result) {
      results.set(deploymentId, { ...results.get(deploymentId), ...result });
    },
    async startBuild(repoUrl, app, agentKey, settings) {
      calls.push(`build ${app} @${agentKey} ${JSON.stringify(buildSettings(settings))}`);
      return "b1";
    },
    async buildStatus() {
      return builder;
    },
    async event(_deploymentId, next) {
      status = next;
      calls.push(`event ${next}`);
    },
    async freezeCloud(app) {
      calls.push(`freeze ${app}`);
    },
    async finishMove(_deploymentId, value, url) {
      calls.push(`finish ${value.appName} ${url}`);
      return outcome;
    },
    async cancelMove(value) {
      calls.push(`cancel ${value.appName}`);
    },
    autoFix: async () => {
      calls.push("autofix");
      return true;
    },
  };
  return deps;
}

describe("클라우드 앱을 내 PC 로 옮기기", () => {
  it("고정한 앱 이름으로 에이전트에 보내고, 끝나면 Ingress 를 넘겨 클라우드 주소를 남긴다", async () => {
    const deps = fake({ database: "cloud" });
    await runOnce(deps);
    deps.finish({ status: "SUCCEEDED", url: "https://book-club-1b62c0.lilycloud.kr", message: null });
    await runOnce(deps);

    expect(deps.calls).toEqual([
      `build ${APP} @a1b2c3d4e5f6 {"database":"postgres","databaseMode":"cloud"}`,
      `run ${APP}`,
      "event running",
      `finish ${APP} https://book-club-1b62c0.lilycloud.kr`,
      "event succeeded",
    ]);
    expect(deps.results.get("d1")?.url).toBe("https://book-club-1b62c0.apps.lilycloud.kr");
  });

  it("DB 를 내 PC 로 옮기면 클라우드를 먼저 내리고 import 를 실어 보낸다", async () => {
    const deps = fake({ database: "local" });
    await runOnce(deps);

    expect(deps.calls.slice(0, 2)).toEqual([
      `freeze ${APP}`,
      `build ${APP} @a1b2c3d4e5f6 {"database":"postgres","databaseMode":"local","importDatabase":true}`,
    ]);
  });

  it("내 PC 배포가 실패하면 클라우드를 되돌리고 자동으로 고쳐 다시 보내지 않는다", async () => {
    const deps = fake({ database: "local" });
    await runOnce(deps);
    deps.finish({ status: "FAILED", url: null, message: "health failed" });
    await runOnce(deps);

    expect(deps.calls).toContain(`cancel ${APP}`);
    expect(deps.calls).not.toContain("autofix");
    expect(deps.calls.at(-1)).toBe("event failed");
    expect(deps.results.get("d1")?.message).toContain("클라우드에 그대로");
  });

  it("내 PC 배포를 취소하면 클라우드를 되돌리고 cancelled 로 닫는다", async () => {
    const deps = fake({ database: "local" });
    await runOnce(deps);
    deps.finish({ status: "CANCELLED", url: null, message: "사용자가 취소했다" });
    await runOnce(deps);

    expect(deps.calls).toContain(`cancel ${APP}`);
    expect(deps.calls).not.toContain("autofix");
    expect(deps.calls.at(-1)).toBe("event cancelled");
    expect(deps.results.get("d1")?.message).toBe("내 PC 로 옮기기를 취소해서 클라우드에 그대로 두었어요.");
  });

  it("Ingress 를 넘긴 뒤 확인이 실패하면 실패로 남긴다", async () => {
    const deps = fake({ database: null }, { ok: false, message: "클라우드 주소로 내 PC 앱에 닿지 않아 클라우드로 되돌렸어요." });
    await runOnce(deps);
    deps.finish({ status: "SUCCEEDED", url: "https://book-club-1b62c0.lilycloud.kr", message: null });
    await runOnce(deps);

    expect(deps.calls.at(-1)).toBe("event failed");
    expect(deps.results.get("d1")?.message).toContain("닿지 않아");
    expect(deps.calls).not.toContain(`freeze ${APP}`);
  });
});
