import { AuthShell } from "@/components/auth/AuthShell";
import { RecoveryForm } from "@/components/auth/RecoveryForm";
export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="이메일을 인증해 주세요."
      description="인증 메일을 다시 보내드릴게요."
    >
      <RecoveryForm mode="verify" />
    </AuthShell>
  );
}
