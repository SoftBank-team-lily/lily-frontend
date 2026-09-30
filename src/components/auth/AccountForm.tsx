"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { authError } from "@/lib/auth/errors";
import type { User } from "@/lib/auth/types";
import { AuthField } from "./AuthField";
import { Button } from "@/components/ui/Button";

export function AccountForm({ user }: { user: User }) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const name = String(
      new FormData(event.currentTarget).get("name") ?? "",
    ).trim();
    if (!name || name.length > 50) {
      setError("표시 이름은 1~50자로 입력해 주세요.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authClient.updateUser({ name });
      if (response.error) {
        setError(authError(response.error));
        return;
      }
      setMessage("표시 이름을 저장했어요.");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy} className="space-y-5">
      <fieldset disabled={busy} className="flex flex-col gap-5">
        <AuthField
          id="email"
          label="이메일"
          type="email"
          value={user.email}
          readOnly
          autoComplete="email"
        />
        <p className="text-caption text-mute">
          {user.emailVerified ? "이메일 인증 완료" : "이메일 인증 필요"}
        </p>
        <AuthField
          id="name"
          name="name"
          label="표시 이름"
          required
          maxLength={50}
          defaultValue={user.name}
          autoComplete="nickname"
        />
        <Button type="submit" className="h-12">
          {busy ? "저장 중…" : "계정 정보 저장"}
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
