import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RecoveryForm } from "@/components/auth/RecoveryForm";
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const valid =
    typeof query.token === "string" &&
    query.token.length > 0 &&
    query.token.length <= 4096 &&
    !query.error;
  return (
    <AuthShell
      title="새 비밀번호를 설정하세요."
      description="다른 곳에서 사용하지 않는 비밀번호를 입력해 주세요."
    >
      {valid ? (
        <RecoveryForm mode="reset" token={query.token as string} />
      ) : (
        <div className="space-y-5">
          <p role="alert" className="text-note text-danger">
            재설정 링크가 만료되었거나 유효하지 않아요.
          </p>
          <Link href="/forgot-password" className="text-ink underline">
            새 링크 받기
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
