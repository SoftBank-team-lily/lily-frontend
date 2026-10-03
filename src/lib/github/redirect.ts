/** 로그인 쿠키가 있는 주소로 되돌린다. 127.0.0.1 과 localhost 는 쿠키를 공유하지 않는다. */
export function sameOrigin(request: Request) {
  const allowed = [
    process.env.BETTER_AUTH_URL,
    ...(process.env.AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value)
    .flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "");
  if (host) {
    try {
      const origin = new URL(`${proto}://${host}`).origin;
      if (allowed.includes(origin)) return origin;
    } catch {
      // 허용 목록에 없는 Host 는 쓰지 않는다
    }
  }
  const current = new URL(request.url).origin;
  if (allowed.includes(current)) return current;
  return allowed[0] ?? current;
}

export function accountRedirect(request: Request, code: string) {
  const url = new URL("/account", sameOrigin(request));
  url.searchParams.set("github", code);
  return Response.redirect(url);
}
