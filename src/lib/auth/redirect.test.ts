import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./redirect";

describe("로그인 후 대시보드 복귀", () => {
  it("정확한 경로와 유효한 프로젝트 ID만 보존한다", () => {
    const id = "1b62c0de-0000-4000-8000-000000000001";
    expect(safeReturnPath("/dashboard")).toBe("/dashboard");
    expect(safeReturnPath(`/dashboard?project=${id}&target=other`)).toBe(`/dashboard?project=${id}`);
    expect(safeReturnPath("/dashboard?project=bad")).toBe("/");
  });
  it("외부 주소 및 대시보드처럼 보이는 다른 경로를 허용하지 않는다", () => {
    for (const value of ["//evil.test/dashboard", "/\\evil.test/dashboard", "https://evil.test", "/dashboard/evil", "/dashboard-other"])
      expect(safeReturnPath(value)).toBe("/");
  });
});
