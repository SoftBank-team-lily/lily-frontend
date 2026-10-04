"use client";

import { localeLink } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { authError } from "@/lib/auth/errors";
import { AuthField } from "./AuthField";
import { Button } from "@/components/ui/Button";

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next: string;
}) {
  const { t, locale } = useI18n();
  const signup = mode === "signup";
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (signup && password !== data.get("confirm")) {
      setError("비밀번호 확인이 일치하지 않아요.");
      event.currentTarget.querySelector<HTMLInputElement>("#confirm")?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = signup
        ? await authClient.signUp.email({
            email,
            password,
            name:
              String(data.get("name") ?? "").trim() ||
              email.split("@")[0].slice(0, 50),
            callbackURL: `/login?verified=1&next=${encodeURIComponent(next)}`,
          })
        : await authClient.signIn.email({ email, password });
      if (response.error) {
        setError(authError(response.error));
        return;
      }
      if (signup) setSent(true);
      else {
        if (next === "/dashboard" || next.startsWith("/dashboard?")) {
          window.location.assign(localeLink(next, locale));
        } else {
          router.replace(next);
          router.refresh();
        }
      }
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (sent)
    return (
      <div className="space-y-5 text-note">
        <p role="status">
          {t(
            "가입 요청을 받았어요. 이메일 인증을 완료한 뒤 로그인해 주세요. 이미 가입한 이메일이라면 로그인하거나 비밀번호를 재설정해 주세요.",
          )}
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="text-ink underline"
        >
          {t("로그인으로")}
        </Link>
      </div>
    );
  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={busy}>
        <fieldset disabled={busy} className="flex flex-col gap-5">
          {signup && (
            <AuthField
              id="name"
              name="name"
              label={t("표시 이름 (선택)")}
              maxLength={50}
              autoComplete="nickname"
            />
          )}
          <AuthField
            id="email"
            name="email"
            label={t("이메일")}
            type="email"
            required
            maxLength={254}
            autoComplete="email"
          />
          <AuthField
            id="password"
            name="password"
            label={signup ? t("비밀번호 (12~128자)") : t("비밀번호")}
            type="password"
            required
            minLength={signup ? 12 : undefined}
            maxLength={128}
            autoComplete={signup ? "new-password" : "current-password"}
          />
          {signup && (
            <AuthField
              id="confirm"
              name="confirm"
              label={t("비밀번호 확인")}
              type="password"
              required
              autoComplete="new-password"
              maxLength={128}
            />
          )}
          <Button type="submit" className="h-12">
            {busy ? t("처리 중…") : signup ? t("회원가입") : t("로그인")}
          </Button>
        </fieldset>
        <p role="alert" className="min-h-[1.4em] text-caption text-danger">
          {t(error)}
        </p>
      </form>
      <div className="mt-5 flex flex-wrap gap-5 text-caption text-mute">
        <Link
          href={`${signup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`}
          className="hover:text-ink"
        >
          {signup ? t("이미 계정이 있어요") : t("계정 만들기")}
        </Link>
        {!signup && (
          <Link href="/forgot-password" className="hover:text-ink">
            {t("비밀번호를 잊었어요")}
          </Link>
        )}
        {!signup && (
          <Link href="/verify-email" className="hover:text-ink">
            {t("인증 메일 다시 받기")}
          </Link>
        )}
      </div>
    </>
  );
}
