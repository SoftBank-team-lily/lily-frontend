"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { authError } from "@/lib/auth/errors";
import { AuthField } from "./AuthField";
import { Button } from "@/components/ui/Button";

export function RecoveryForm({
  mode,
  token,
}: {
  mode: "verify" | "forgot" | "reset";
  token?: string;
}) {
  const reset = mode === "reset";
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (reset && fields.get("password") !== fields.get("confirm")) {
      setError("비밀번호 확인이 일치하지 않아요.");
      form.querySelector<HTMLInputElement>("#confirm")?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const email = String(fields.get("email") ?? "").trim();
      const response = reset
        ? await authClient.resetPassword({
            token: token ?? "",
            newPassword: String(fields.get("password")),
          })
        : mode === "verify"
          ? await authClient.sendVerificationEmail({
              email,
              callbackURL: "/login?verified=1",
            })
          : await authClient.requestPasswordReset({
              email,
              redirectTo: "/reset-password",
            });
      if (response.error) {
        setError(authError(response.error));
        return;
      }
      form.reset();
      setMessage(
        reset
          ? "비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요."
          : "요청을 받았어요. 등록된 계정이라면 받은 메일의 링크를 확인해 주세요.",
      );
    } catch {
      setError("서버에 연결하지 못했어요. 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
        <fieldset
          disabled={busy || (reset && !!message)}
          className="flex flex-col gap-5"
        >
          {reset ? (
            <>
              <AuthField
                id="password"
                name="password"
                label="새 비밀번호 (12~128자)"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <AuthField
                id="confirm"
                name="confirm"
                label="비밀번호 확인"
                type="password"
                required
                maxLength={128}
                autoComplete="new-password"
              />
            </>
          ) : (
            <AuthField
              id="email"
              name="email"
              label="이메일"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          )}
          <Button type="submit" className="h-12">
            {busy ? "처리 중…" : reset ? "비밀번호 재설정" : "메일 받기"}
          </Button>
        </fieldset>
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
        <p role="status" className="text-note text-mute">
          {message}
        </p>
      </form>
      <Link
        href="/login"
        className="mt-6 inline-block text-caption text-ink underline"
      >
        로그인으로
      </Link>
    </>
  );
}
