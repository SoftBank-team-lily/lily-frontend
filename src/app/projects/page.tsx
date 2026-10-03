import { getTranslator } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNav } from "@/components/auth/AuthNav";
import { listProjects } from "@/lib/projects/server";
import { ProjectList } from "@/components/projects/ProjectList";
import { SessionGuard } from "@/components/auth/SessionGuard";

export default async function ProjectsPage() {
  const t = await getTranslator();
  const user = await getUser();
  if (!user) redirect("/login?next=%2Fprojects");
  const projects = await listProjects(user.id);
  return (
    <AuthShell
      title={t("내 프로젝트")}
      description={t(
        "올린 프로젝트를 배포하고, 하나를 누르면 거점·트래픽·지표를 한눈에 봐요.",
      )}
      navigation={<AuthNav user={user} />}
      wide
    >
      <SessionGuard key={user.id} userId={user.id}>
        <ProjectList key={`projects:${user.id}`} initialPage={projects} />
      </SessionGuard>
    </AuthShell>
  );
}
