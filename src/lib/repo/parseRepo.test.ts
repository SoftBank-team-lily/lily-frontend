import { describe, expect, it } from "vitest";
import { parseRepo } from "./parseRepo";
import { toSlug } from "./toSlug";

describe("레포 입력", () => {
  it.each([
    "owner/repo",
    "github.com/owner/repo",
    "https://www.github.com/owner/repo.git",
    " owner/repo/ ",
  ])("허용: %s", (value) => expect(parseRepo(value)).toBe("owner/repo"));
  it.each([
    "",
    "not a repo!!",
    `${"a".repeat(40)}/repo`,
    "https://evil.com/o/r",
  ])("거부: %s", (value) => expect(parseRepo(value)).toBeNull());
  it("원본의 .git/ 처리 순서를 보존한다", () =>
    expect(parseRepo("https://www.github.com/o/r.git/")).toBe("o/r.git"));
  it("레포 이름으로 slug를 만든다", () =>
    expect(toSlug("owner/Next.js")).toBe("next-js"));
});
