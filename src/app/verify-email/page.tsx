import { getTranslator } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RecoveryForm } from "@/components/auth/RecoveryForm";
export default async function VerifyEmailPage() {
  const t = await getTranslator();
  return (
    <AuthShell
      title={t("이메일을 인증해 주세요.")}
      description={t("인증 메일을 다시 보내드릴게요.")}
    >
      <RecoveryForm mode="verify" />
    </AuthShell>
  );
}
