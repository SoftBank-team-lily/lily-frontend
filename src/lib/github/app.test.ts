import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { githubAppConfig, readPrivateKey, signAppJwt } from "./app";
import { listInstallationRepos, nextPage } from "./github-api";

describe("GitHub App 설정", () => {
  it("앱 id, slug, 시크릿, 키가 있을 때만 준비된다", () => {
    expect(
      githubAppConfig({
        GITHUB_APP_ID: "123",
        GITHUB_APP_SLUG: "lily",
        GITHUB_APP_WEBHOOK_SECRET: "secret",
        GITHUB_APP_PRIVATE_KEY: "not-a-key",
      }).ready,
    ).toBe(false);
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(
      githubAppConfig({
        GITHUB_APP_ID: "123",
        GITHUB_APP_SLUG: "lily",
        GITHUB_APP_WEBHOOK_SECRET: "secret",
        GITHUB_APP_PRIVATE_KEY: pem.replaceAll("\n", "\\n"),
      }).ready,
    ).toBe(true);
  });

  it("줄바꿈을 넣은 PEM 과 base64 PEM 을 읽는다", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(readPrivateKey(pem.replaceAll("\n", "\\n"))).toBe(pem);
    expect(readPrivateKey(Buffer.from(pem).toString("base64"))).toBe(pem);
  });

  it("앱 JWT 는 RS256 이고 iss 가 앱 id 다", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const token = signAppJwt("12345", pem, 1_700_000_000_000);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({
      alg: "RS256",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
      iss: "12345",
    });
    expect(
      createVerify("RSA-SHA256")
        .update(`${header}.${payload}`)
        .verify(publicKey, Buffer.from(signature, "base64url")),
    ).toBe(true);
  });
});

describe("설치 저장소 목록", () => {
  it("다음 페이지는 api.github.com 만 따라간다", () => {
    expect(
      nextPage(
        '<https://api.github.com/installation/repositories?page=2>; rel="next", <https://evil.example>; rel="last"',
      ),
    ).toBe("https://api.github.com/installation/repositories?page=2");
    expect(nextPage('<https://evil.example/next>; rel="next"')).toBeNull();
  });

  it("저장소 이름을 소문자로 모은다", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          repositories: [{ full_name: "Owner/Repo" }, { full_name: "not a repo" }],
        }),
        { status: 200, headers: { link: "" } },
      );
    await expect(listInstallationRepos("token", fetchImpl)).resolves.toEqual([
      "owner/repo",
    ]);
  });
});
