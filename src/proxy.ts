import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeCookie } from "@/lib/i18n/config";

/** Only consume a validated UI preference; authentication stays with the existing routes. */
export function proxy(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("lang");
  if (!isLocale(locale)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.searchParams.delete("lang");
  const response = NextResponse.redirect(url);
  response.cookies.set(localeCookie, locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}
export const config = { matcher: ["/((?!api|_next|.*\\.).*)"] };
