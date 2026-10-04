import { createInstance, type i18n } from "i18next";
import type { Locale } from "./config";
import en from "./en.json";
import ja from "./ja.json";

export function createI18n(locale: Locale) {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: "ko",
    supportedLngs: ["ko", "en", "ja"],
    resources: {
      ko: {
        translation: Object.fromEntries(
          Object.keys(en).map((key) => [key, key]),
        ),
      },
      en: { translation: en },
      ja: { translation: ja },
    },
    keySeparator: false,
    nsSeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
  return instance;
}

const sourceKeys = new Map(
  Object.entries(en)
    .concat(Object.entries(ja))
    .map(([source, translated]) => [translated, source]),
);
const patterns = Object.keys(en)
  .filter((key) => key.includes("{{"))
  .map((key) => {
    const names: string[] = [];
    const escaped = key
      .split(/(\{\{[^}]+\}\})/)
      .map((part) => {
        const placeholder = part.match(/^\{\{([^}]+)\}\}$/);
        if (placeholder) {
          names.push(placeholder[1]);
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return { key, names, regex: new RegExp(`^${escaped}$`) };
  });

/** Translate fixed UI messages from adapters too; unknown messages remain verbatim. */
export function translate(
  i18n: i18n,
  text: string | null | undefined,
  values?: Record<string, unknown>,
  locale?: Locale,
): string {
  if (!text) return "";
  const key = sourceKeys.get(text) ?? text;
  if (i18n.exists(key))
    return i18n.t(key, { ...values, lng: locale ?? i18n.language }) as string;
  for (const pattern of patterns) {
    const match = key.match(pattern.regex);
    if (match)
      return i18n.t(pattern.key, {
        ...Object.fromEntries(
          pattern.names.map((name, index) => [name, translate(i18n, match[index + 1], undefined, locale)]),
        ),
        lng: locale ?? i18n.language,
      }) as string;
  }
  return text;
}

export function translator(locale: Locale) {
  const i18n = createI18n(locale);
  return (
    text: string | null | undefined,
    values?: Record<string, unknown>,
  ): string => translate(i18n, text, values);
}
