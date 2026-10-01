import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNav } from "@/components/auth/AuthNav";
import { AccountForm } from "@/components/auth/AccountForm";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { listProjects } from "@/lib/projects/server";
import { ProjectList } from "@/components/projects/ProjectList";
import { SessionGuard } from "@/components/auth/SessionGuard";

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=%2Faccount");
  const projects = await listProjects(user.id);
  return (
    <AuthShell
      title="내 계정"
      description="계정 정보와 비밀번호를 관리하세요."
      navigation={<AuthNav user={user} />}
    >
      <SessionGuard key={user.id} userId={user.id}>
        <AccountForm key={`account:${user.id}`} user={user} />
        <ProjectList key={`projects:${user.id}`} initialPage={projects} />
        <section
          className="mt-10 border-t border-line pt-8"
          aria-labelledby="password-title"
        >
          <h2 id="password-title" className="mb-5 text-lead font-semibold">
            비밀번호 변경
          </h2>
          <PasswordForm />
        </section>
      </SessionGuard>
      <Link
        href="/"
        className="mt-8 inline-block text-caption text-mute hover:text-ink"
      >
        랜딩으로
      </Link>
    </AuthShell>
  );
}
