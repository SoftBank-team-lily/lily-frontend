"use client";

import { useEffect, useId, useRef } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { locales } from "@/lib/i18n/config";
import styles from "./LanguageMenu.module.css";

const names = { ko: "한국어", en: "English", ja: "日本語" };

export function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const menu = useRef<HTMLDetailsElement>(null);
  const id = useId();
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        menu.current &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function close() {
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  }
  return (
    <details
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
      ref={menu}
      className={styles.menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <summary
        className={styles.trigger}
        aria-label={t("언어 설정")}
        aria-controls={id}
        title={t("언어 설정")}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18M5 6.5h14M5 17.5h14" />
        </svg>
        <span className={styles.code}>{locale.toUpperCase()}</span>
      </summary>
      <div
        id={id}
        className={styles.options}
        role="group"
        aria-label={t("언어 선택")}
      >
        {locales.map((value) => (
          <button
            type="button"
            key={value}
            lang={value}
            aria-pressed={locale === value}
            onClick={() => {
              setLocale(value);
              close();
            }}
          >
            <span>{names[value]}</span>
            <span aria-hidden="true">{locale === value ? "✓" : ""}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
