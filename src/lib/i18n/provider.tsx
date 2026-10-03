"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { createI18n, translate as translateText } from "./engine";
import { localeCookie, type Locale } from "./config";

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (value: Locale) => void;
} | null>(null);

export function LanguageProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [i18n] = useState(() => createI18n(initialLocale));
  const [locale, updateLocale] = useState(initialLocale);
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      updateLocale(next);
      void i18n.changeLanguage(next);
      document.documentElement.lang = next;
      router.refresh();
    },
    [i18n, router],
  );
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LocaleContext);
  const { i18n } = useTranslation();
  const locale = context?.locale;
  const t = useCallback(
    (
      text: string | null | undefined,
      values?: Record<string, unknown>,
    ): string => translateText(i18n, text, values, locale),
    [i18n, locale],
  );
  if (!context) throw new Error("LanguageProvider is missing");
  return { ...context, t };
}
