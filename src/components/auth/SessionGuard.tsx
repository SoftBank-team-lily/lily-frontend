"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SessionGuard({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { data, isPending, error } = authClient.useSession();
  const router = useRouter();
  const matches = isPending || data?.user.id === userId;
  useEffect(() => {
    if (isPending || error || matches) return;
    if (data?.user) router.refresh();
    else router.replace("/login?next=%2Faccount");
  }, [data?.user, error, isPending, matches, router]);
  if (!matches || error)
    return (
      <p role="status" className="text-note text-mute">
        {t("로그인 상태를 확인하고 있어요. 연결되지 않으면 새로고침해 주세요.")}
      </p>
    );
  return children;
}
