import { beforeEach, describe, expect, it } from "vitest";
import {
  allowed,
  appName,
  BuilderRejected,
  finalStatus,
  runOnce,
  type RunDeps,
} from "./run";

const PROJECT = "1b62c0de-0000-4000-8000-000000000001";

type Fake = RunDeps & {
  queue(repo: string): string;
  status: Map<string, string>;
  builds: Map<string, string>;
  builderStatus: Map<string, string | null>;
  started: string[];
  events: string[];
  reject: boolean;
  down: boolean;
  failEvent: boolean;
};

function fake(): Fake {
  const repos = new Map<string, string>();
  let next = 0;
  const deps: Fake = {
    status: new Map(),
    builds: new Map(),
    builderStatus: new Map(),
    started: [],
    events: [],
    reject: false,
    down: false,
    failEvent: false,
    allowedOwners: [],
    maxActive: 2,
    queue(repo) {
      const id = `d${++next}`;
      repos.set(id, repo);
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
        .map((id) => ({ deploymentId: id, projectId: PROJECT, repo: repos.get(id)! }));
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
    async startBuild(repoUrl, app) {
      if (deps.reject) throw new BuilderRejected("400 bad repo");
      if (deps.down) throw new Error("connection refused");
      deps.started.push(`${repoUrl} ${app}`);
      return `b${deps.started.length}`;
    },
    async buildStatus(buildId) {
      return deps.builderStatus.has(buildId)
        ? deps.builderStatus.get(buildId)!
        : "BUILDING";
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
    deps.builderStatus.set("b1", "SUCCEEDED");
    deps.builderStatus.set("b2", "ROLLED_BACK");
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
    deps.builderStatus.set("b1", "SUCCEEDED");
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
