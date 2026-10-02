import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/layout/SiteNav";

export function AuthShell({
  title,
  description,
  children,
  navigation,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  navigation?: ReactNode;
  /** 모니터링처럼 넓게 보는 화면 */
  wide?: boolean;
}) {
  return (
    <>
      <SiteNav>
        {navigation ?? (
          <Link href="/" className="text-caption text-mute hover:text-ink">
            랜딩으로
          </Link>
        )}
      </SiteNav>
      <main
        className={`mx-auto flex min-h-screen flex-col px-6 pt-28 pb-12 ${wide ? "max-w-5xl" : "max-w-lg justify-center"}`}
      >
        <h1 className="text-display font-semibold">{title}</h1>
        <p className="mt-3 text-note text-mute">{description}</p>
        <div className="mt-8">{children}</div>
      </main>
    </>
  );
}
