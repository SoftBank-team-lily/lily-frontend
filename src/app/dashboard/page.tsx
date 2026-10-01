import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export default function DashboardUnavailable() {
  return <AuthShell title="대시보드 연결을 준비하고 있어요." description="대시보드 서비스가 연결되면 여기에서 프로젝트 상태를 볼 수 있어요.">
    <Link href="/account" className="text-ink underline">내 프로젝트로</Link>
  </AuthShell>;
}
