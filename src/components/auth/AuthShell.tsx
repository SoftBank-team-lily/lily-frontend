import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/layout/SiteNav";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteNav>
        <Link href="/" className="text-caption text-mute hover:text-ink">
          랜딩으로
        </Link>
      </SiteNav>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 pt-28 pb-12">
        <h1 className="text-display font-semibold">{title}</h1>
        <p className="mt-3 text-note text-mute">{description}</p>
        <div className="mt-8">{children}</div>
      </main>
    </>
  );
}
