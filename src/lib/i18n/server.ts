import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { localeCookie, resolveLocale } from "./config";
import { translator } from "./engine";

export const getLocale = cache(async () =>
  resolveLocale((await cookies()).get(localeCookie)?.value),
);
export async function getTranslator() {
  return translator(await getLocale());
}
