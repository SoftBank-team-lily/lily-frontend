import { AuthNav } from "@/components/auth/AuthNav";
import { getUser } from "@/lib/auth/session";
import { REQUIRE_EMAIL_VERIFICATION } from "@/lib/auth/policy";
import { HomeClient } from "@/components/landing/HomeClient";
import { AuthShell } from "@/components/auth/AuthShell";
import { getProjectEntry } from "@/lib/projects/server";
import { idSchema } from "@/lib/projects/schema";
import { ApiError } from "@/lib/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ProjectEntry } from "@/lib/projects/types";

export default async function Home({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, query] = await Promise.all([getUser(), searchParams]);
  if (query.project) {
    const id = idSchema.safeParse(query.project);
    if (!id.success)
      return (
        <AuthShell
          title="프로젝트를 열 수 없어요."
          description="프로젝트 주소를 확인해 주세요."
        >
          <Link href="/account" className="text-ink underline">
            내 프로젝트로
          </Link>
        </AuthShell>
      );
    if (!user)
      redirect(`/login?next=${encodeURIComponent(`/?project=${id.data}`)}`);
    if (REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)
      redirect("/verify-email");
    let entry: ProjectEntry | undefined;
    let message = "프로젝트를 확인하지 못했어요.";
    try {
      entry = await getProjectEntry(user.id, id.data);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      message = error.message;
    }
    if (!entry) {
      return (
        <AuthShell
          title="프로젝트를 열 수 없어요."
          description={message}
          navigation={<AuthNav user={user} />}
        >
          <Link href="/account" className="text-ink underline">
            내 프로젝트로
          </Link>
        </AuthShell>
      );
    }
    return (
      <HomeClient
        key={`${user.id}:${id.data}`}
        user={user}
        project={entry.project}
        dashboardConnected={!!entry.destination}
      />
    );
  }
  return <HomeClient key={user?.id ?? "guest"} user={user} dashboardConnected={!!(process.env.DASHBOARD_ORIGIN || process.env.DASHBOARD_URL)} />;
}
