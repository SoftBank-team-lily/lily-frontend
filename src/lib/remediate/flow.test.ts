import { describe, expect, it } from "vitest";
import { branchName, remediate, type Incident, type ProjectFix } from "./flow";

const incident: Incident = {
  app: "blog",
  signature: "IllegalStateException OrderService.java:42",
  log: "masked",
  files: ["src/main/java/com/acme/OrderService.java"],
};

function project(over: Partial<ProjectFix> = {}): ProjectFix {
  return {
    enabled: true,
    consent: true,
    installationId: "42",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    openSignatures: [],
    ...over,
  };
}

describe("로그 사고 PR", () => {
  it("기능이 꺼져 있으면 모델과 GitHub를 부르지 않는다", async () => {
    let called = false;
    const result = await remediate(incident, project({ enabled: false }), {
      draft: async () => {
        called = true;
        return { status: "draft", files: {} };
      },
      openPull: async () => {
        called = true;
        return "https://github.com/acme/blog/pull/1";
      },
    });
    expect(result.status).toBe("off");
    expect(called).toBe(false);
  });

  it("동의가 꺼져 있으면 멈추고, jev가 아니면 diff를 받지 않은 것과 같이 거절한다", async () => {
    const quiet = await remediate(incident, project({ consent: false }), {
      draft: async () => {
        throw new Error("draft");
      },
      openPull: async () => {
        throw new Error("pr");
      },
    });
    expect(quiet).toMatchObject({ status: "off", reason: "프로젝트 동의가 꺼져 있다" });

    const noSha = await remediate(incident, project({ commitSha: null }), {
      draft: async () => {
        throw new Error("draft");
      },
      openPull: async () => {
        throw new Error("pr");
      },
    });
    expect(noSha.reason).toBe("배포 커밋이 없다");
  });

  it("같은 서명이 열려 있으면 PR을 또 열지 않는다", async () => {
    const result = await remediate(
      incident,
      project({ openSignatures: [incident.signature] }),
      {
        draft: async () => {
          throw new Error("draft");
        },
        openPull: async () => {
          throw new Error("pr");
        },
      },
    );
    expect(result.reason).toBe("같은 서명의 PR이 열려 있다");
  });

  it("워크플로 diff는 PR로 올리지 않는다", async () => {
    let opened = false;
    const result = await remediate(incident, project(), {
      draft: async () => ({
        status: "draft",
        files: { ".github/workflows/ci.yml": "name: changed\n" },
      }),
      openPull: async () => {
        opened = true;
        return "https://github.com/acme/blog/pull/1";
      },
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("고칠 수 없는 경로");
    expect(opened).toBe(false);
  });

  it("검증을 통과한 파일만 PR로 연다", async () => {
    const result = await remediate(incident, project(), {
      draft: async () => ({
        status: "draft",
        files: { "src/main/java/com/acme/OrderService.java": "class OrderService {}\n" },
      }),
      openPull: async () => "https://github.com/acme/blog/pull/7",
    });
    expect(result).toMatchObject({
      status: "opened",
      url: "https://github.com/acme/blog/pull/7",
    });
    expect(branchName(incident.signature)).toBe(
      "lily/fix-illegalstateexception-orderservice-java-42",
    );
  });
});
