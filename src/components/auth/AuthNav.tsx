"use client";

import { useI18n } from "@/lib/i18n/provider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import type { User } from "@/lib/auth/types";

export function AuthNav({ user }: { user: User | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const viewer = isPending ? user : (data?.user ?? null);
  const previous = useRef(user?.id ?? null);
  useEffect(() => {
    if (isPending) return;
    const id = data?.user.id ?? null;
    if (previous.current !== id) {
      previous.current = id;
      router.refresh();
    }
  }, [data?.user.id, isPending, router]);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await authClient.signOut();
      if (response.error) {
        setError("로그아웃하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-caption text-mute">
      {viewer ? (
        <>
          <Link href="/projects" className="hover:text-ink">
            {t("내 프로젝트")}
          </Link>
          <Link href="/account" className="hover:text-ink">
            {t("내 계정")}
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="hover:text-ink disabled:opacity-40"
          >
            {busy ? t("로그아웃 중…") : t("로그아웃")}
          </button>
        </>
      ) : (
        <>
          <Link href="/login" className="hover:text-ink">
            {t("로그인")}
          </Link>
          <Link href="/signup" className="text-ink">
            {t("회원가입")}
          </Link>
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-right text-danger">
          {t(error)}
        </p>
      )}
    </div>
  );
}
