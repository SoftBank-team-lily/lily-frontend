import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/server", () => ({ getAgent: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: vi.fn() } }));
vi.mock("@/lib/projects/server", () => ({ getProject: vi.fn() }));
import { getAgent } from "@/lib/agents/server";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects/server";
import { getMonitor, readResource, redact } from "./server";
import { databasesSchema, metricsSchema } from "./schema";

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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


it("실제 API 필드를 매핑하며 일부 실패와 다른 앱 데이터를 분리한다", async () => {
  vi.mocked(getProject).mockResolvedValueOnce({ id: "project", name: "sample", target: "cloud", repo: "team/repo", rootDir: "backend", latestDeployment: null } as Awaited<ReturnType<typeof getProject>>);
  vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ app_name: "owned-app", env: { JWT_SECRET: "private-secret" }, database_url: null }] } as never);
  vi.stubEnv("OBSERVABILITY_URL", "http://observer");
  vi.stubEnv("INGRESS_API_URL", "http://ingress");
  vi.stubEnv("PROVISIONER_URL", "http://provisioner");
  const current = { requestsPerMinute: 20, errorRate: 0.025, avgLatencyMs: 10, p95LatencyMs: 30 };
  const app = { app: "owned-app", namespace: "default", url: null, strategy: "blue-green", activeSlot: "green", readyReplicas: 1, replicas: 1, image: "app:v1", deployments: [] };
  const fetch = vi.fn(async (input: URL) => {
    const url = new URL(input);
    if (url.hostname === "ingress") return new Response("private upstream error", { status: 500 });
    if (url.hostname === "provisioner") return Response.json([{ id: "db", engine: "POSTGRES", status: "READY", password: "hidden" }]);
    if (url.pathname.endsWith("/metrics")) return Response.json({ app: "owned-app", namespace: "default", current, series: [{ at: "2026-10-02T00:00:00Z", ...current }] });
    if (url.pathname.endsWith("/status")) return Response.json({ app: "owned-app", namespace: "default", level: "WARNING", message: "주의", reason: "오류 증가", action: "주의 알림", judgedAt: "2026-10-02T00:00:00Z" });
    if (url.pathname.endsWith("/pods")) return Response.json([]);
    if (url.pathname.endsWith("/logs")) return Response.json([{ at: "2026-10-02T00:00:00Z", pod: null, slot: null, image: null, message: "value private-secret" }]);
    return Response.json([{ ...app, app: "other-app" }, app]);
  });
  vi.stubGlobal("fetch", fetch);
  const result = await getMonitor("owner", "project", { window: "15m", level: "error" });
  expect(result.metrics).toMatchObject({ state: "ready", data: { current: { errorRate: 0.025 } } });
  expect(result.route.state).toBe("unavailable");
  expect(result.app).toMatchObject({ state: "ready", data: { app: "owned-app" } });
  expect(JSON.stringify(result)).not.toContain("other-app");
  expect(JSON.stringify(result)).not.toContain("private-secret");
  expect(JSON.stringify(result)).not.toContain("hidden");
  expect(fetch.mock.calls.some(([url]) => url.searchParams.get("level") === "error" && url.searchParams.get("since") === "15m")).toBe(true);
});


it("온프레미스 앱도 에이전트 연결과 함께 클라우드 쪽 관측을 읽는다", async () => {
  vi.mocked(getProject).mockResolvedValueOnce({ id: "project", name: "sample", target: "onprem", repo: "team/repo", rootDir: "", latestDeployment: null } as Awaited<ReturnType<typeof getProject>>);
  vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ app_name: "owned-app", env: {}, database_url: null }] } as never);
  vi.mocked(getAgent).mockResolvedValueOnce({ connected: true, agentId: "my-pc", database: true });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const result = await getMonitor("owner", "project", { window: "15m", level: "all" });
  expect(result.agent).toMatchObject({ state: "ready", data: { connected: true } });
  // 같은 이름의 클라우드 쪽(버스팅 대기·거점 클라우드) 지표를 본다. 관측 주소가 없으면 미설정
  expect(result.metrics.state).not.toBe("unsupported");
});

it("배포 기록이 없으면 레포 이름으로 앱을 추측하지 않는다", async () => {
  vi.mocked(getProject).mockResolvedValueOnce({ id: "project", name: "looks-like-app", target: "cloud", repo: "team/looks-like-app", rootDir: "", latestDeployment: null } as Awaited<ReturnType<typeof getProject>>);
  vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ app_name: null, env: {}, database_url: null }] } as never);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const result = await getMonitor("owner", "project", { window: "15m", level: "all" });
  expect(result.appName).toBeNull(); expect(result.metrics.state).toBe("pending");
  expect(fetch).not.toHaveBeenCalled();
});
