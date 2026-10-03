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

  it("버스팅 비율은 0~100 정수, 거점은 cloud·onprem 만 받는다", async () => {
    const { burstSchema, homeSchema } = await import("./schema");
    expect(validate(burstSchema, { enabled: true, cloudPercent: 30 })).toEqual({ enabled: true, cloudPercent: 30 });
    expect(() => validate(burstSchema, { enabled: true, cloudPercent: 101 })).toThrow();
    expect(() => validate(burstSchema, { enabled: true, cloudPercent: 2.5 })).toThrow();
    expect(validate(homeSchema, { home: "cloud" })).toEqual({ home: "cloud" });
    expect(() => validate(homeSchema, { home: "edge" })).toThrow();
  });

  it("쓰기 큐 경로는 / 로 시작하고 ?·#·공백이 없는 20개까지 받고, 빈 목록은 끄기로 받는다", async () => {
    const { writeQueueSchema } = await import("./schema");
    expect(validate(writeQueueSchema, { paths: [" /posts ", "/comments/"] })).toEqual({
      paths: ["/posts", "/comments/"],
    });
    expect(validate(writeQueueSchema, { paths: [] })).toEqual({ paths: [] });
    expect(() => validate(writeQueueSchema, { paths: ["posts"] })).toThrow();
    expect(() => validate(writeQueueSchema, { paths: ["/posts?draft=1"] })).toThrow();
    expect(() => validate(writeQueueSchema, { paths: ["/my posts"] })).toThrow();
    expect(() => validate(writeQueueSchema, { paths: Array(21).fill("/posts") })).toThrow();
    expect(() => validate(writeQueueSchema, { paths: ["/posts"], extra: true })).toThrow();
  });
});
