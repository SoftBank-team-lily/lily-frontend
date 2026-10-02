import { ApiError } from "@/lib/api";
import { getUser } from "@/lib/auth/session";
import { completeInstall } from "@/lib/github/install";
import { accountRedirect, sameOrigin } from "@/lib/github/redirect";

export const runtime = "nodejs";

function githubCode(error: unknown) {
  if (!(error instanceof ApiError)) return "error";
  if (error.code === "GITHUB_APP_UNCONFIGURED") return "unconfigured";
  if (error.code === "INVALID_STATE" || error.code === "INVALID_INSTALLATION")
    return "denied";
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
  const query = new URL(request.url).searchParams;
  const state = query.get("state") ?? "";
  const installationId = query.get("installation_id") ?? "";
  if (!state || !installationId) return accountRedirect(request, "denied");
  try {
    await completeInstall(user.id, state, installationId);
    return accountRedirect(request, "connected");
  } catch (error) {
    return accountRedirect(request, githubCode(error));
  }
}
