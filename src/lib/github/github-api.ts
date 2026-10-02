const API = "https://api.github.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lily",
  };
}

async function readJson(response: Response) {
  if (!response.ok) throw new Error("github");
  return response.json() as Promise<unknown>;
}

export function nextPage(link: string | null) {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    const url = match?.[1];
    if (url?.startsWith(`${API}/`)) return url;
  }
  return null;
}

export async function fetchInstallation(
  jwt: string,
  installationId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const body = await readJson(
    await fetchImpl(`${API}/app/installations/${installationId}`, {
      headers: headers(jwt),
    }),
  );
  const login =
    body && typeof body === "object"
      ? (body as { account?: { login?: unknown } }).account?.login
      : null;
  if (typeof login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(login))
    throw new Error("github");
  return { accountLogin: login };
}

export async function createInstallationToken(
  jwt: string,
  installationId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const body = await readJson(
    await fetchImpl(`${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: headers(jwt),
    }),
  );
  const token =
    body && typeof body === "object"
      ? (body as { token?: unknown }).token
      : null;
  if (typeof token !== "string" || !token) throw new Error("github");
  return token;
}

const REPO_NAME = /^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/;

/** 설치가 볼 수 있는 저장소. 릴리 프로젝트 repo 와 맞추려고 소문자다 */
export async function listInstallationRepos(
  token: string,
  fetchImpl: typeof fetch = fetch,
) {
  const names: string[] = [];
  let url: string | null = `${API}/installation/repositories?per_page=100`;
  for (let page = 0; page < 10 && url; page += 1) {
    const response = await fetchImpl(url, { headers: headers(token) });
    const body = await readJson(response);
    const repositories =
      body && typeof body === "object"
        ? (body as { repositories?: unknown }).repositories
        : null;
    if (Array.isArray(repositories)) {
      for (const repository of repositories) {
        const fullName =
          repository && typeof repository === "object"
            ? (repository as { full_name?: unknown }).full_name
            : null;
        if (typeof fullName !== "string") continue;
        const repo = fullName.trim().toLowerCase();
        if (REPO_NAME.test(repo)) names.push(repo);
      }
    }
    url = nextPage(response.headers.get("link"));
  }
  return names;
}
