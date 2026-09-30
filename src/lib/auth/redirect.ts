export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "/";
  try {
    const url = new URL(value, "https://lily.local");
    if (url.origin !== "https://lily.local") return "/";
    if (url.pathname === "/account") return "/account";
    if (url.pathname !== "/") return "/";
    const project = url.searchParams.get("project");
    if (
      project &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        project,
      )
    ) {
      return `/?project=${encodeURIComponent(project)}`;
    }
  } catch {
    /* 유효하지 않은 주소는 랜딩으로 복귀합니다. */
  }
  return "/";
}
