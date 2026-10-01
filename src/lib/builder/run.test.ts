import { beforeEach, describe, expect, it } from "vitest";
import {
  allowed,
  buildSettings,
  resultLine,
  type BuildState,
  type RunResult,
  appName,
  BuilderRejected,
  finalStatus,
  runOnce,
  type RunDeps,
} from "./run";

const PROJECT = "1b62c0de-0000-4000-8000-000000000001";

type Fake = RunDeps & {
  queue(
    repo: string,
    target?: "cloud" | "onprem",
    agentKey?: string | null,
  ): string;
  status: Map<string, string>;
  builds: Map<string, string>;
  builderStatus: Map<string, BuildState | null>;
  results: Map<string, RunResult>;
  started: string[];
  events: string[];
  reject: boolean;
  down: boolean;
  failEvent: boolean;
};

function fake(): Fake {
  const repos = new Map<
    string,
    { repo: string; target: "cloud" | "onprem"; agentKey: string | null }
  >();
  let next = 0;
  const deps: Fake = {
    status: new Map(),
    builds: new Map(),
    builderStatus: new Map(),
    results: new Map(),
    started: [],
    events: [],
    reject: false,
    down: false,
    failEvent: false,
    allowedOwners: [],
    maxActive: 2,
    queue(repo, target = "cloud", agentKey = null) {
      const id = `d${++next}`;
      repos.set(id, { repo, target, agentKey });
      deps.status.set(id, "queued");
      return id;
    },
    async enqueueNewProjects() {
      return 0;
    },
    async pending(limit) {
      return [...repos.keys()]
        .filter((id) => deps.status.get(id) === "queued" && !deps.builds.has(id))
        .slice(0, limit)
        .map((id) => ({ deploymentId: id, projectId: PROJECT, ...repos.get(id)! }));
    },
    async active() {
      return [...deps.builds.entries()]
        .filter(([id]) => ["queued", "running"].includes(deps.status.get(id)!))
        .map(([id, buildId]) => ({
          deploymentId: id,
          status: deps.status.get(id) as "queued" | "running",
          buildId,
        }));
    },
    async saveRun(deploymentId, buildId) {
      deps.builds.set(deploymentId, buildId);
    },
    async saveResult(deploymentId, result) {
      deps.results.set(deploymentId, {
        ...deps.results.get(deploymentId),
        ...result,
      });
    },
    async startBuild(repoUrl, app, agentKey) {
      if (deps.reject) throw new BuilderRejected("400 bad repo");
      if (deps.down) throw new Error("connection refused");
      deps.started.push(`${repoUrl} ${app}${agentKey ? ` @${agentKey}` : ""}`);
      return `b${deps.started.length}`;
    },
    async buildStatus(buildId) {
      return deps.builderStatus.has(buildId)
        ? deps.builderStatus.get(buildId)!
        : { status: "BUILDING", url: null, message: null };
    },
    async event(deploymentId, status) {
      if (deps.failEvent) {
        deps.failEvent = false;
        throw new Error("db down");
      }
      deps.events.push(`${deploymentId} ${status}`);
      deps.status.set(deploymentId, status);
    },
  };
  return deps;
}

describe("배포 실행기 한 주기", () => {
  let deps: Fake;
  beforeEach(() => {
    deps = fake();
  });

  it("queued 배포를 builder 로 보내고 running 을 기록한다", async () => {
    const id = deps.queue("SoftBank-team-lily/lily-blog-sample");
    await runOnce(deps);
    expect(deps.started).toEqual([
      "https://github.com/SoftBank-team-lily/lily-blog-sample lily-blog-sample-1b62c0",
    ]);
    expect(deps.events).toEqual([`${id} running`]);
  });

  it("builder 가 끝나면 결과를 기록한다", async () => {
    const ok = deps.queue("a/ok");
    const bad = deps.queue("a/bad");
    await runOnce(deps);
    deps.builderStatus.set("b1", { status: "SUCCEEDED", url: null, message: null });
    deps.builderStatus.set("b2", {
      status: "ROLLED_BACK",
      url: null,
      message: "canary 판정 실패",
    });
    await runOnce(deps);
    expect(deps.events).toEqual([
      `${ok} running`,
      `${bad} running`,
      `${ok} succeeded`,
      `${bad} failed`,
    ]);
  });

  it("아직 queued 면 running 을 먼저 기록한다", async () => {
    const id = deps.queue("a/b");
    deps.failEvent = true;
    await runOnce(deps);
    expect(deps.status.get(id)).toBe("queued");
    deps.builderStatus.set("b1", { status: "SUCCEEDED", url: null, message: null });
    await runOnce(deps);
    expect(deps.events).toEqual([`${id} running`, `${id} succeeded`]);
  });

  it("builder 에 기록이 없으면 실패로 본다", async () => {
    const id = deps.queue("a/b");
    await runOnce(deps);
    deps.builderStatus.set("b1", null);
    await runOnce(deps);
    expect(deps.events).toEqual([`${id} running`, `${id} failed`]);
  });

  it("builder 가 거절하면 failed", async () => {
    const id = deps.queue("a/b");
    deps.reject = true;
    await runOnce(deps);
    expect(deps.events).toEqual([`${id} failed`]);
  });

  it("builder 가 잠깐 안 되면 다음 주기에 다시 보낸다", async () => {
    const id = deps.queue("a/b");
    deps.down = true;
    await runOnce(deps);
    expect(deps.events).toEqual([]);
    deps.down = false;
    await runOnce(deps);
    expect(deps.events).toEqual([`${id} running`]);
  });

  it("동시 빌드 수를 넘기지 않는다", async () => {
    deps.queue("a/one");
    deps.queue("a/two");
    deps.queue("a/three");
    await runOnce(deps);
    expect(deps.started).toHaveLength(2);
  });

  it("성공하면 접속 주소를 남긴다", async () => {
    const id = deps.queue("a/b");
    await runOnce(deps);
    deps.builderStatus.set("b1", {
      status: "SUCCEEDED",
      url: "https://b-1b62c0.apps.lilycloud.kr",
      message: null,
    });
    await runOnce(deps);
    expect(deps.results.get(id)?.url).toBe("https://b-1b62c0.apps.lilycloud.kr");
    expect(deps.events).toEqual([`${id} running`, `${id} succeeded`]);
  });

  it("내 PC 프로젝트는 에이전트로 보내고 앱 이름을 31자 안으로 줄인다", async () => {
    deps.queue(`a/${"long-repository-name-".repeat(3)}`, "onprem", "a1b2c3d4e5f6");
    await runOnce(deps);
    const [url, app, agent] = deps.started[0].split(" ");
    expect(url).toContain("github.com/a/");
    expect(app.length).toBeLessThanOrEqual(31);
    expect(app).toMatch(/^[a-z][a-z0-9-]*-1b62c0$/);
    expect(agent).toBe("@a1b2c3d4e5f6");
  });

  it("내 PC 프로젝트인데 연결된 에이전트가 없으면 보내지 않고 failed", async () => {
    const id = deps.queue("a/b", "onprem", null);
    await runOnce(deps);
    expect(deps.started).toEqual([]);
    expect(deps.events).toEqual([`${id} failed`]);
    expect(deps.results.get(id)?.message).toContain("내 PC가 연결되지 않았어요");
  });

  it("builder 가 실패하면 이유 한 줄을 남긴다", async () => {
    const id = deps.queue("a/b");
    await runOnce(deps);
    deps.builderStatus.set("b1", {
      status: "FAILED",
      url: null,
      message: "이 앱은 DB(postgres)가 필요한데 내 PC 에이전트에 DB 터널이 없다",
    });
    await runOnce(deps);
    expect(deps.events).toEqual([`${id} running`, `${id} failed`]);
    expect(deps.results.get(id)?.message).toContain("DB 터널이 없다");
  });

  it("허용되지 않은 소유자의 레포는 보내지 않고 failed", async () => {
    deps.allowedOwners = ["SoftBank-team-lily"];
    const other = deps.queue("someone/repo");
    deps.queue("softbank-team-lily/lily-blog-sample");
    await runOnce(deps);
    expect(deps.started).toHaveLength(1);
    expect(deps.events[0]).toBe(`${other} failed`);
  });
});

describe("이름과 상태", () => {
  it("앱 이름은 k8s 이름 규칙을 지킨다", () => {
    expect(appName("Owner/My.Cool_Repo", PROJECT)).toBe("my-cool-repo-1b62c0");
    expect(appName("owner/123app", PROJECT)).toBe("app-123app-1b62c0");
    expect(appName("owner/---", PROJECT)).toBe("app-1b62c0");
    expect(appName(`owner/${"x".repeat(100)}`, PROJECT)).toHaveLength(47);
  });
  it("builder 로그 마지막 줄에서 결과 한 줄을 뽑는다", () => {
    expect(
      resultLine(["queued", "agent: FAILED failed: health failed, traffic unchanged"]),
    ).toBe("health failed, traffic unchanged");
    expect(resultLine(["failed: 에이전트가 연결돼 있지 않다"])).toBe(
      "에이전트가 연결돼 있지 않다",
    );
    expect(resultLine(["done: https://x"])).toBe("https://x");
    expect(resultLine([])).toBeNull();
  });
  it("builder 상태를 최종 상태로 바꾼다", () => {
    expect(finalStatus("SUCCEEDED")).toBe("succeeded");
    expect(finalStatus("FAILED")).toBe("failed");
    expect(finalStatus("ROLLED_BACK")).toBe("failed");
    expect(finalStatus("BUILDING")).toBeNull();
    expect(finalStatus(null)).toBe("failed");
  });
  it("소유자 허용 목록", () => {
    expect(allowed("a/b", [])).toBe(true);
    expect(allowed("SoftBank-team-lily/x", ["softbank-team-lily"])).toBe(true);
    expect(allowed("evil/x", ["softbank-team-lily"])).toBe(false);
  });
});

describe("배포 설정", () => {
  it("폴더를 앱 이름에 붙여 한 레포의 백엔드·프론트가 겹치지 않는다", () => {
    expect(appName("hyunsuhahaha/book-club", PROJECT, 40, "backend")).toBe(
      "book-club-backend-1b62c0",
    );
    expect(appName("hyunsuhahaha/book-club", PROJECT, 40, "apps/web/")).toBe(
      "book-club-web-1b62c0",
    );
  });

  it("비어 있는 값은 builder 로 보내지 않는다", () => {
    expect(buildSettings({ rootDir: "", env: {}, port: null })).toEqual({});
    expect(
      buildSettings({
        branch: "dev",
        rootDir: "backend",
        port: 8080,
        healthPath: "/api/health",
        env: { JWT_SECRET: "x" },
      }),
    ).toEqual({
      branch: "dev",
      rootDir: "backend",
      targetPort: 8080,
      readinessPath: "/api/health",
      livenessPath: "/api/health",
      env: { JWT_SECRET: "x" },
    });
  });

  it("등록할 때 정한 설정을 builder 로 넘긴다", async () => {
    const deps = fake();
    let sent: unknown;
    deps.startBuild = async (_repo, _app, _agent, settings) => {
      sent = settings;
      return "b1";
    };
    deps.pending = async () => [
      {
        deploymentId: "d1",
        projectId: PROJECT,
        repo: "hyunsuhahaha/book-club",
        target: "cloud",
        agentKey: null,
        settings: { rootDir: "frontend" },
      },
    ];
    await runOnce(deps);
    expect(sent).toEqual({ rootDir: "frontend" });
  });
});

describe("진행 상황", () => {
  it("진행 중인 builder 상태와 로그 끝부분을 남긴다", async () => {
    const deps = fake();
    const saved: [string, string, string[]][] = [];
    deps.saveProgress = async (id, stage, logs) => {
      saved.push([id, stage, logs]);
    };
    const id = deps.queue("o/app");
    await runOnce(deps);
    const logs = Array.from({ length: 50 }, (_, index) => `line ${index}`);
    deps.builderStatus.set("b1", { status: "DEPLOYING", url: null, message: null, logs });
    await runOnce(deps);
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toBe(id);
    expect(saved[0][1]).toBe("DEPLOYING");
    expect(saved[0][2]).toHaveLength(40);
    expect(saved[0][2].at(-1)).toBe("line 49");
  });
});
