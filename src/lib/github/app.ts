import { createSign } from "node:crypto";

export type GithubAppConfig = {
  id: string;
  slug: string;
  webhookSecret: string;
  privateKey: string | null;
  ready: boolean;
};

/** PEM 그대로, 줄바꿈을 \n 으로 넣은 값, 또는 PEM 의 base64 */
export function readPrivateKey(raw: string | undefined) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const pem = trimmed.includes("BEGIN")
    ? trimmed.replace(/\\n/g, "\n")
    : decodeBase64Pem(trimmed);
  return pem?.includes("BEGIN") ? pem : null;
}

function decodeBase64Pem(value: string) {
  try {
    return Buffer.from(value, "base64").toString("utf8").replace(/\\n/g, "\n");
  } catch {
    return null;
  }
}

export function githubAppConfig(
  env: Record<string, string | undefined> = process.env,
): GithubAppConfig {
  const id = env.GITHUB_APP_ID?.trim() ?? "";
  const slug = env.GITHUB_APP_SLUG?.trim() ?? "";
  const webhookSecret = env.GITHUB_APP_WEBHOOK_SECRET?.trim() ?? "";
  const privateKey = readPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  const slugOk = /^[A-Za-z0-9-]{1,100}$/.test(slug);
  const idOk = /^[1-9][0-9]{0,18}$/.test(id);
  return {
    id,
    slug,
    webhookSecret,
    privateKey,
    ready: Boolean(idOk && slugOk && webhookSecret && privateKey),
  };
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

/** GitHub App JWT. iss 는 앱 id, 유효 시간은 10분 */
export function signAppJwt(appId: string, privateKeyPem: string, now = Date.now()) {
  const iat = Math.floor(now / 1000) - 60;
  const data = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat, exp: iat + 600, iss: appId }),
  )}`;
  const signature = createSign("RSA-SHA256").update(data).sign(privateKeyPem);
  return `${data}.${signature.toString("base64url")}`;
}
