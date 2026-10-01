import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { query: vi.fn() } }));
vi.mock("@/lib/projects/server", () => ({ getProject: vi.fn() }));
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects/server";
import { getMonitor, readResource, redact } from "./server";
import { databasesSchema, metricsSchema } from "./schema";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("프로젝트 관측 경계", () => {
  it("소유권 확인에 실패하면 DB 매핑과 내부 API를 조회하지 않는다", async () => {
    vi.mocked(getProject).mockRejectedValueOnce(new Error("NOT_FOUND"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(getMonitor("other", "project", { window: "15m", level: "all" })).rejects.toThrow("NOT_FOUND");
    expect(db.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("미설정, 404, 잘못된 응답을 정상 수치로 바꾸지 않는다", async () => {
    expect((await readResource(undefined, undefined, "api", metricsSchema)).state).toBe("unconfigured");
    const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json({ current: { errorRate: "0" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await readResource("http://observer", "secret", "api", metricsSchema)).state).toBe("pending");
    expect((await readResource("http://observer", "secret", "api", metricsSchema)).state).toBe("unavailable");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  });
  it("DB 상태 DTO는 접속 정보와 오류 본문을 제거한다", () => {
    expect(databasesSchema.parse([{ id: "db1", engine: "POSTGRES", status: "READY", host: "private", password: "secret", errorMessage: "secret" }]))
      .toEqual([{ id: "db1", engine: "POSTGRES", status: "READY" }]);
  });
  it("저장된 비밀값, Bearer 토큰과 DB 비밀번호를 로그에서 가린다", () => {
    const result = redact("value=long-private-value Authorization: Bearer abc.xyz jdbc:postgresql://user:pass@db/db password=hidden", ["long-private-value"]);
    expect(result).not.toContain("long-private-value"); expect(result).not.toContain("abc.xyz");
    expect(result).not.toContain(":pass@"); expect(result).not.toContain("hidden");
  });
});
