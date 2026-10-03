import { describe, expect, it } from "vitest";
import { openFixPullRequest } from "./github-pr";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const NEXT = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

describe("수정 PR", () => {
  it("배포 커밋 위에 브랜치와 PR만 만들고 머지하지 않는다", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.endsWith(`/git/commits/${COMMIT}`)) {
        return Response.json({ tree: { sha: "tree1" } });
      }
      if (url.endsWith("/git/blobs")) return Response.json({ sha: "blob1" });
      if (url.endsWith("/git/trees")) {
        expect(body.base_tree).toBe("tree1");
        expect(body.tree[0].path).toBe("src/OrderService.java");
        return Response.json({ sha: "tree2" });
      }
      if (url.endsWith("/git/commits")) {
        expect(body.parents).toEqual([COMMIT]);
        return Response.json({ sha: NEXT });
      }
      if (url.endsWith("/git/refs")) {
        expect(body.ref).toBe("refs/heads/lily/fix-npe");
        expect(body.sha).toBe(NEXT);
        return Response.json({ ref: body.ref });
      }
      if (url.endsWith("/pulls")) {
        expect(body.head).toBe("lily/fix-npe");
        expect(body.base).toBe("main");
        return Response.json({ html_url: "https://github.com/acme/blog/pull/3" });
      }
      return new Response("no", { status: 404 });
    };

    const url = await openFixPullRequest(
      {
        token: "ghs_test",
        repo: "acme/blog",
        base: "main",
        commit: COMMIT,
        branch: "lily/fix-npe",
        title: "IllegalStateException OrderService.java:42",
        body: "자동 머지하지 않는다.",
        files: [{ path: "src/OrderService.java", content: "class OrderService {}\n" }],
      },
      fetchImpl,
    );

    expect(url).toBe("https://github.com/acme/blog/pull/3");
    expect(calls.some((call) => call.includes("/merges"))).toBe(false);
  });
});
