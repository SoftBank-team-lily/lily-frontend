import { afterEach, describe, expect, it } from "vitest";
import { sameOrigin } from "./redirect";

describe("설치 후 돌아갈 주소", () => {
  const previous = process.env.AUTH_TRUSTED_ORIGINS;
  afterEach(() => {
    process.env.AUTH_TRUSTED_ORIGINS = previous;
  });

  it("브라우저가 연 주소가 허용 목록에 있으면 그 주소로 되돌린다", () => {
    process.env.AUTH_TRUSTED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";
    const request = new Request("http://localhost:3000/api/github/install", {
      headers: { host: "127.0.0.1:3000" },
    });
    expect(sameOrigin(request)).toBe("http://127.0.0.1:3000");
  });

  it("허용되지 않은 Host 는 쓰지 않는다", () => {
    process.env.AUTH_TRUSTED_ORIGINS = "http://127.0.0.1:3000";
    const request = new Request("http://127.0.0.1:3000/api/github/install", {
      headers: { host: "evil.example" },
    });
    expect(sameOrigin(request)).toBe("http://127.0.0.1:3000");
  });
});
