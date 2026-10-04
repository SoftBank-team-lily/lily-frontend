export const locales = ["ko", "en", "ja"] as const;
export type Locale = (typeof locales)[number];
export const localeCookie = "lily-locale";
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : "ko";
}

/** Carry the preference when frontend and dashboard use different origins. */
export function localeLink(href: string, locale: Locale): string {
  const url = new URL(href, "http://lily.local");
  if (!["http:", "https:"].includes(url.protocol)) return href;
  url.searchParams.set("lang", locale);
  return /^[a-z]+:\/\//i.test(href)
    ? url.href
    : `${url.pathname}${url.search}${url.hash}`;
}
