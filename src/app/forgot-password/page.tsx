import { AuthShell } from "@/components/auth/AuthShell";
import { RecoveryForm } from "@/components/auth/RecoveryForm";
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="비밀번호를 잊으셨나요?"
      description="가입한 이메일로 비밀번호 재설정 링크를 보내드릴게요."
    >
      <RecoveryForm mode="forgot" />
    </AuthShell>
  );
}
