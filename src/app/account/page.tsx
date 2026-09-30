import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNav } from "@/components/auth/AuthNav";
import { AccountForm } from "@/components/auth/AccountForm";
import { PasswordForm } from "@/components/auth/PasswordForm";

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=%2Faccount");
  return (
    <AuthShell
      title="내 계정"
      description="계정 정보와 비밀번호를 관리하세요."
      navigation={<AuthNav user={user} />}
    >
      <AccountForm key={user.id} user={user} />
      <section
        className="mt-10 border-t border-line pt-8"
        aria-labelledby="password-title"
      >
        <h2 id="password-title" className="mb-5 text-lead font-semibold">
          비밀번호 변경
        </h2>
        <PasswordForm />
      </section>
      <Link
        href="/"
        className="mt-8 inline-block text-caption text-mute hover:text-ink"
      >
        랜딩으로
      </Link>
    </AuthShell>
  );
}
