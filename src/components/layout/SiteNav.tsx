import type { ReactNode, Ref } from "react";

export function SiteNav({
  children,
  ref,
}: {
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <nav
      ref={ref}
      aria-label="사이트"
      className="fixed inset-x-0 top-0 z-10 bg-linear-to-b from-scrim to-transparent pt-[env(safe-area-inset-top,0px)]"
    >
      <div className="mx-auto flex max-w-page items-center justify-between px-6 py-4.5">
        <span className="text-brand font-semibold">Lily</span>
        {children}
      </div>
    </nav>
  );
}
