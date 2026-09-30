import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { after } from "next/server";
import { db } from "@/lib/db";
import { sendAuthMail } from "./mail";

const baseURL = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;
if (
  !baseURL ||
  !secret ||
  secret.length < 32 ||
  secret.startsWith("replace-")
) {
  throw new Error(
    "BETTER_AUTH_URL과 무작위 BETTER_AUTH_SECRET을 설정해 주세요.",
  );
}
if (
  process.env.NODE_ENV === "production" &&
  !baseURL.startsWith("https://") &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)
) {
  throw new Error("운영 인증 URL은 HTTPS를 사용해야 합니다.");
}
function validateName(value: unknown) {
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > 50
  ) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_NAME",
      message: "표시 이름은 1~50자로 입력해 주세요.",
    });
  }
  return value.trim();
}

export const auth = betterAuth({
  appName: "Lily",
  baseURL,
  secret,
  database: db,
  trustedOrigins: [
    baseURL,
    ...(process.env.AUTH_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthMail(
        user.email,
        "Lily 비밀번호 재설정",
        `비밀번호를 다시 설정하려면 아래 링크를 열어 주세요.\n\n${url}\n\n요청하지 않았다면 이 메일을 무시해 주세요.`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthMail(
        user.email,
        "Lily 이메일 인증",
        `Lily 계정을 인증하려면 아래 링크를 열어 주세요.\n\n${url}\n\n링크는 1시간 동안 유효합니다.`,
      );
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  advanced: {
    cookiePrefix: "lily",
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    backgroundTasks: {
      handler: (task) =>
        after(async () => {
          try {
            await task;
          } catch {
            console.error(
              "인증 메일 작업을 완료하지 못했습니다. SMTP 설정을 확인해 주세요.",
            );
          }
        }),
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, name: validateName(user.name) },
        }),
      },
      update: {
        before: async (user) =>
          user.name === undefined
            ? undefined
            : { data: { ...user, name: validateName(user.name) } },
      },
    },
  },
});
