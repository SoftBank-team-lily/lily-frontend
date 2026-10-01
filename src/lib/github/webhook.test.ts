import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleWebhook, WebhookRejected, type WebhookProject } from "./webhook";

const SECRET = "a".repeat(64);
const OTHER = "b".repeat(64);
const SHA = "0123456789abcdef0123456789abcdef01234567";

function raw(value: unknown) {
  return Buffer.from(JSON.stringify(value));
}

function signature(body: Buffer, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function push(over: Record<string, unknown> = {}) {
  return raw({
    ref: "refs/heads/main",
    after: SHA,
    repository: { full_name: "Owner/Repo" },
    ...over,
  });
}

function harness(projects: WebhookProject[]) {
  const deployed: string[] = [];
  return {
    deployed,
    findProjects: async (repo: string) =>
      repo === "owner/repo" ? projects : [],
    deploy: async (_ownerId: string, projectId: string, sha: string) => {
      deployed.push(`${projectId}:${sha}`);
    },
  };
}

const mainProject: WebhookProject = {
  id: "p1",
  ownerId: "u1",
  branch: null,
  secret: SECRET,
};

describe("GitHub 웹훅", () => {
  it("브랜치가 비어 있으면 main 푸시로 그 프로젝트를 배포한다", async () => {
    const body = push();
    const deps = harness([mainProject]);
    const result = await handleWebhook({
      event: "push",
      signature: signature(body, SECRET),
      body,
      ...deps,
    });
    expect(result).toEqual({ status: 200, body: { deployed: 1 } });
    expect(deps.deployed).toEqual([`p1:${SHA}`]);
  });

  it("서명이 맞는 프로젝트만 배포한다", async () => {
    const body = push({ ref: "refs/heads/develop" });
    const deps = harness([
      mainProject,
      { id: "p2", ownerId: "u1", branch: "develop", secret: OTHER },
      { id: "p3", ownerId: "u2", branch: "develop", secret: SECRET },
    ]);
    const result = await handleWebhook({
      event: "push",
      signature: signature(body, OTHER),
      body,
      ...deps,
    });
    expect(result.body).toEqual({ deployed: 1 });
    expect(deps.deployed).toEqual([`p2:${SHA}`]);
  });

  it("서명이 틀리면 배포하지 않는다", async () => {
    const body = push();
    const deps = harness([mainProject]);
    await expect(
      handleWebhook({
        event: "push",
        signature: signature(body, OTHER),
        body,
        ...deps,
      }),
    ).rejects.toBeInstanceOf(WebhookRejected);
    expect(deps.deployed).toEqual([]);
  });

  it("등록되지 않은 저장소는 서명 없이 넘어간다", async () => {
    const body = raw({
      ref: "refs/heads/main",
      after: SHA,
      repository: { full_name: "other/app" },
    });
    const deps = harness([mainProject]);
    const result = await handleWebhook({
      event: "push",
      signature: null,
      body,
      ...deps,
    });
    expect(result).toEqual({ status: 200, body: { deployed: 0 } });
    expect(deps.deployed).toEqual([]);
  });

  it("ping 은 배포하지 않고 연결만 확인한다", async () => {
    const body = raw({ zen: "keep it logically awesome", repository: { full_name: "Owner/Repo" } });
    const deps = harness([mainProject]);
    const result = await handleWebhook({
      event: "ping",
      signature: signature(body, SECRET),
      body,
      ...deps,
    });
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(deps.deployed).toEqual([]);
  });

  it("태그, 브랜치 삭제, 다른 브랜치는 배포하지 않는다", async () => {
    const deps = harness([mainProject]);
    for (const value of [
      { ref: "refs/tags/v1", after: SHA },
      { ref: "refs/heads/main", after: "0".repeat(40), deleted: true },
      { ref: "refs/heads/develop", after: SHA },
    ]) {
      const body = push(value);
      const result = await handleWebhook({
        event: "push",
        signature: signature(body, SECRET),
        body,
        ...deps,
      });
      expect(result.body).toEqual({ deployed: 0 });
    }
    expect(deps.deployed).toEqual([]);
  });

  it("본문이 JSON 이 아니면 거절한다", async () => {
    await expect(
      handleWebhook({
        event: "push",
        signature: null,
        body: Buffer.from("not-json"),
        ...harness([mainProject]),
      }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_BODY" });
  });
});
