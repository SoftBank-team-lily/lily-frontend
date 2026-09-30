import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { safeReturnPath } from "@/lib/auth/redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <AuthShell
      title="Lily에서 시작하세요."
      description="계정을 만들고 이메일 인증을 완료해 주세요."
    >
      <SignupForm next={safeReturnPath(query.next)} />
    </AuthShell>
  );
}
