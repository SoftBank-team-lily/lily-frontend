import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeReturnPath } from "@/lib/auth/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <AuthShell
      title="다시 만나서 반가워요."
      description="Lily 계정으로 내 프로젝트를 관리하세요."
    >
      {query.verified === "1" && !query.error && (
        <p role="status" className="mb-5 text-note text-mute">
          이메일 인증이 완료됐어요. 로그인해 주세요.
        </p>
      )}
      {query.error && (
        <p role="alert" className="mb-5 text-note text-danger">
          인증 링크가 유효하지 않아요. 로그인 화면에서 인증 메일을 다시 요청해
          주세요.
        </p>
      )}
      <LoginForm next={safeReturnPath(query.next)} />
    </AuthShell>
  );
}
