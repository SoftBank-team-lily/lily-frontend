import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNav } from "@/components/auth/AuthNav";
import { getProject } from "@/lib/projects/server";
import { ProjectMonitor } from "@/components/projects/ProjectMonitor";
import { SessionGuard } from "@/components/auth/SessionGuard";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/projects/${id}`)}`);
  const project = await getProject(user.id, id, true).catch(() => null);
  if (!project) notFound();
  return (
    <AuthShell title={project.name} description={project.repo} navigation={<AuthNav user={user} />} wide>
      <SessionGuard key={user.id} userId={user.id}>
        <ProjectMonitor initial={project} />
      </SessionGuard>
    </AuthShell>
  );
}
