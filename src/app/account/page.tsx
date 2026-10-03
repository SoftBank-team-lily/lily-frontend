import { getTranslator } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNav } from "@/components/auth/AuthNav";
import { AccountForm } from "@/components/auth/AccountForm";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { SessionGuard } from "@/components/auth/SessionGuard";

export default async function AccountPage() {
  const t = await getTranslator();
  const user = await getUser();
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <AuthShell
      title={t("내 계정")}
      description={t("계정 정보와 비밀번호를 관리하세요.")}
      navigation={<AuthNav user={user} />}
    >
      <SessionGuard key={user.id} userId={user.id}>
        <AccountForm key={`account:${user.id}`} user={user} />
        <Link
          href="/projects"
          className="mt-8 inline-block text-control text-ink underline"
        >
          {t("내 프로젝트 보기")}
        </Link>
        <section
          className="mt-10 border-t border-line pt-8"
          aria-labelledby="password-title"
        >
          <h2 id="password-title" className="mb-5 text-lead font-semibold">
            {t("비밀번호 변경")}
          </h2>
          <PasswordForm />
        </section>
      </SessionGuard>
      <Link
        href="/"
        className="mt-8 inline-block text-caption text-mute hover:text-ink"
      >
        {t("랜딩으로")}
      </Link>
    </AuthShell>
  );
}
