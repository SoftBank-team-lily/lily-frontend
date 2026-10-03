import { getTranslator } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RecoveryForm } from "@/components/auth/RecoveryForm";
export default async function ForgotPasswordPage() {
  const t = await getTranslator();
  return (
    <AuthShell
      title={t("비밀번호를 잊으셨나요?")}
      description={t("가입한 이메일로 비밀번호 재설정 링크를 보내드릴게요.")}
    >
      <RecoveryForm mode="forgot" />
    </AuthShell>
  );
}
