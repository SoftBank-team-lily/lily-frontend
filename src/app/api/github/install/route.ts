import { ApiError, limitWrites } from "@/lib/api";
import { getUser } from "@/lib/auth/session";
import { beginInstall } from "@/lib/github/install";
import { accountRedirect, sameOrigin } from "@/lib/github/redirect";

export const runtime = "nodejs";

function githubCode(error: unknown) {
  if (!(error instanceof ApiError)) return "error";
  if (error.code === "GITHUB_APP_UNCONFIGURED") return "unconfigured";
  if (error.code === "INVALID_STATE") return "denied";
  if (error.code === "INSTALLATION_TAKEN") return "taken";
  return "error";
}

export async function GET(request: Request) {
  const user = await getUser(request.headers);
  if (!user) {
    const login = new URL("/login", sameOrigin(request));
    login.searchParams.set("next", "/account");
    return Response.redirect(login);
  }
  if (!user.emailVerified)
    return Response.redirect(new URL("/verify-email", sameOrigin(request)));
  try {
    await limitWrites(user.id, "github-install", 5);
    return Response.redirect(await beginInstall(user.id));
  } catch (error) {
    return accountRedirect(request, githubCode(error));
  }
}
