import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/limits", () => ({ consumeLimit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getUser: vi.fn(async () => ({
    id: "u1",
    email: "a@lily.test",
    name: "a",
    emailVerified: false,
  })),
}));

// 정책 값은 모듈을 불러올 때 읽으므로 환경 변수를 바꾼 뒤 새로 불러온다
async function loadRequireUser(value?: string) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "");
  else vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", value);
  return (await import("./api")).requireUser;
}

describe("requireUser 이메일 인증 정책", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("기본값에서는 미인증 사용자를 403으로 막는다", async () => {
    const requireUser = await loadRequireUser();
    await expect(requireUser(new Request("http://localhost/"))).rejects.toMatchObject({
      status: 403,
      code: "UNVERIFIED",
    });
  });

  it("AUTH_REQUIRE_EMAIL_VERIFICATION=false 이면 미인증 사용자도 통과한다", async () => {
    const requireUser = await loadRequireUser("false");
    await expect(requireUser(new Request("http://localhost/"))).resolves.toMatchObject({
      id: "u1",
      emailVerified: false,
    });
  });
});
