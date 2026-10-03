import { getTranslator } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNav } from "@/components/auth/AuthNav";
import { AccountForm } from "@/components/auth/AccountForm";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { SessionGuard } from "@/components/auth/SessionGuard";

const githubMessages: Record<string, string> = {
  connected: "GitHub 저장소를 연결했어요.",
  denied: "GitHub 연결을 확인하지 못했어요. 다시 연결해 주세요.",
  taken: "이 GitHub 설치는 다른 계정에 연결되어 있어요.",
  unconfigured: "서버에 GitHub App 설정이 아직 없어요.",
  error: "GitHub 저장소 목록을 읽지 못했어요. 잠시 후 다시 연결해 주세요.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslator();
  const query = await searchParams;
  const message = typeof query.github === "string" ? githubMessages[query.github] : undefined;
  const user = await getUser();
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <AuthShell
      title={t("내 계정")}
      description={t("계정 정보와 비밀번호를 관리하세요.")}
      navigation={<AuthNav user={user} />}
    >
      <SessionGuard key={user.id} userId={user.id}>
        {message && <p role="status" className="mb-5 text-note text-mute">{t(message)}</p>}
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
