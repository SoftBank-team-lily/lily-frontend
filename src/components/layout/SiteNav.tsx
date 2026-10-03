"use client";

import { useI18n } from "@/lib/i18n/provider";
import { LanguageMenu } from "@/components/i18n/LanguageMenu";
import type { ReactNode, Ref } from "react";

export function SiteNav({
  children,
  ref,
}: {
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  const { t } = useI18n();
  return (
    <nav
      ref={ref}
      aria-label={t("사이트")}
      className="fixed inset-x-0 top-0 z-10 bg-linear-to-b from-scrim to-transparent pt-[env(safe-area-inset-top,0px)]"
    >
      <div className="mx-auto flex max-w-page items-center justify-between px-6 py-4.5">
        <span className="text-brand font-semibold">Lily</span>
        <div className="flex items-center justify-end gap-3">
          {children}
          <LanguageMenu />
        </div>
      </div>
    </nav>
  );
}
