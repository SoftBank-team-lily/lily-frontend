import { describe, expect, it } from "vitest";
import { parseEnv, readSettings, readUpdate } from "./settingsForm";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("배포 설정 폼", () => {
  it("빈 칸은 보내지 않는다", () => {
    expect(readSettings(form({ branch: " ", rootDir: "", port: "", env: "" }))).toEqual({});
  });

  it("칸에 적은 값을 그대로 읽는다", () => {
    expect(
      readSettings(
        form({
          branch: "main",
          rootDir: "backend",
          port: "8080",
          healthPath: "/api/health",
          env: "JWT_SECRET=abc\n",
        }),
      ),
    ).toEqual({
      branch: "main",
      rootDir: "backend",
      port: 8080,
      healthPath: "/api/health",
      env: { JWT_SECRET: "abc" },
    });
  });

  it("포트가 숫자가 아니면 알려 준다", () => {
    expect(() => readSettings(form({ port: "80a" }))).toThrow("포트는");
  });

  it("환경변수는 .env 형식으로 읽는다 (주석·빈 줄·따옴표·export)", () => {
    expect(
      parseEnv('# 주석\n\nexport A=1\nB="two words"\nURL=postgres://u:p@h/db?x=1'),
    ).toEqual({ A: "1", B: "two words", URL: "postgres://u:p@h/db?x=1" });
  });

  it("형식이 틀린 줄을 알려 준다", () => {
    expect(() => parseEnv("A=1\nnot a pair")).toThrow("2번째 줄");
  });
});

describe("설정 수정 폼", () => {
  it("빈 칸은 null 로 보내 비우고, 환경변수는 적은 것만 넣는다", () => {
    const data = form({ name: "api", branch: "", port: "", healthPath: "", env: "A=1" });
    data.append("removeEnv", "OLD");
    expect(readUpdate(data)).toEqual({
      name: "api",
      branch: null,
      port: null,
      healthPath: null,
      env: { A: "1" },
      removeEnv: ["OLD"],
    });
  });

  it("지우기로 체크했어도 새 값을 적었으면 덮는다", () => {
    const data = form({ name: "api", env: "A=2" });
    data.append("removeEnv", "A");
    expect(readUpdate(data)).toMatchObject({ env: { A: "2" } });
    expect(readUpdate(data).removeEnv).toBeUndefined();
  });

  it("이름이 비면 알려 준다", () => {
    expect(() => readUpdate(form({ name: " " }))).toThrow("이름");
  });
});
