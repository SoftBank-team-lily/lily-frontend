"use client";

import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { authError } from "@/lib/auth/errors";
import { AuthField } from "./AuthField";
import { Button } from "@/components/ui/Button";

export function PasswordForm() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("new-password") ?? "");
    if (newPassword !== data.get("confirm-password")) {
      setError("비밀번호 확인이 일치하지 않아요.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authClient.changePassword({
        currentPassword: String(data.get("current-password")),
        newPassword,
        revokeOtherSessions: true,
      });
      if (response.error) {
        setError(
          response.error.code === "INVALID_PASSWORD"
            ? "현재 비밀번호를 확인해 주세요."
            : authError(response.error),
        );
        return;
      }
      form.reset();
      setMessage("비밀번호를 변경하고 다른 기기의 로그인 상태를 해제했어요.");
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <fieldset disabled={busy} className="flex flex-col gap-5">
        <AuthField
          id="current-password"
          name="current-password"
          label="현재 비밀번호"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
        />
        <AuthField
          id="new-password"
          name="new-password"
          label="새 비밀번호 (12~128자)"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
        <AuthField
          id="confirm-password"
          name="confirm-password"
          label="새 비밀번호 확인"
          type="password"
          required
          maxLength={128}
          autoComplete="new-password"
        />
        <Button type="submit" variant="ghost">
          {busy ? "변경 중…" : "비밀번호 변경"}
        </Button>
      </fieldset>
      <p role="alert" className="text-caption text-danger">
        {error}
      </p>
      <p role="status" className="text-note text-mute">
        {message}
      </p>
    </form>
  );
}
