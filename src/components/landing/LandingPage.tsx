"use client";

import { SiteNav } from "@/components/layout/SiteNav";
import { Reveal } from "@/components/layout/Reveal";
import { DeployForm } from "@/components/deploy/DeployForm";

export function LandingPage() {
  return <>
    <SiteNav />
    <main className="relative z-1">
      <Reveal id="deploy" className="mx-auto flex min-h-screen max-w-page flex-col items-center px-6 pt-[52vh] pb-[6vh] text-center">
        <div className="max-w-lg break-keep text-shadow-halo"><h2 className="mb-[0.8rem] text-display font-semibold">지금 피워 보세요.</h2><p className="text-lead text-mute">배포가 진행될수록 꽃에 색이 번져요. 이 화면은 시연용이라 실제 배포는 일어나지 않아요.</p></div>
        <DeployForm repo="" fail={false} />
      </Reveal>
    </main>
  </>;
}
