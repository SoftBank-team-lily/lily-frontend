import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

describe("프로젝트 입력 검증", async () => {
  // 모듈을 불러오는 것만으로 스키마가 만들어져야 한다 (선언 순서 오류는 여기서 터진다)
  const { projectSchema, updateSchema, validate } = await import("./schema");

  it("레포와 배포 설정을 받는다", () => {
    expect(
      validate(projectSchema, {
        repo: "https://github.com/Owner/Repo",
        rootDir: "/backend/",
        port: 8080,
        env: { JWT_SECRET: "x" },
      }),
    ).toEqual({
      repo: "owner/repo",
      rootDir: "backend",
      port: 8080,
      env: { JWT_SECRET: "x" },
    });
  });

  it("설정 수정은 null 로 비우고, 빈 본문은 거절한다", () => {
    expect(validate(updateSchema, { branch: null, removeEnv: ["A"] })).toEqual({
      branch: null,
      removeEnv: ["A"],
    });
    expect(() => validate(updateSchema, {})).toThrow("바꿀 내용이 없어요.");
  });
});
