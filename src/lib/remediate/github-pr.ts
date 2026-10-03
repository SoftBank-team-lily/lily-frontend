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

type CommitFile = { path: string; content: string };

/**
 * 배포된 커밋 위에 패치 커밋을 올리고 PR 을 연다. 기본 브랜치는 머지하지 않는다.
 * @returns PR 주소
 */
export async function openFixPullRequest(
  args: {
    token: string;
    repo: string;
    base: string;
    commit: string;
    branch: string;
    title: string;
    body: string;
    files: CommitFile[];
  },
  fetchImpl: typeof fetch = fetch,
) {
  const repo = args.repo;
  const parent = (await readJson(
    await fetchImpl(`${API}/repos/${repo}/git/commits/${args.commit}`, { headers: headers(args.token) }),
  )) as { tree?: { sha?: string } };
  const baseTree = parent.tree?.sha;
  if (!baseTree) throw new Error("github");

  const tree = [];
  for (const file of args.files) {
    const blob = (await readJson(
      await fetchImpl(`${API}/repos/${repo}/git/blobs`, {
        method: "POST",
        headers: headers(args.token),
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      }),
    )) as { sha?: string };
    if (!blob.sha) throw new Error("github");
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const nextTree = (await readJson(
    await fetchImpl(`${API}/repos/${repo}/git/trees`, {
      method: "POST",
      headers: headers(args.token),
      body: JSON.stringify({ base_tree: baseTree, tree }),
    }),
  )) as { sha?: string };
  if (!nextTree.sha) throw new Error("github");

  const commit = (await readJson(
    await fetchImpl(`${API}/repos/${repo}/git/commits`, {
      method: "POST",
      headers: headers(args.token),
      body: JSON.stringify({
        message: args.title,
        tree: nextTree.sha,
        parents: [args.commit],
      }),
    }),
  )) as { sha?: string };
  if (!commit.sha || !/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error("github");

  await readJson(
    await fetchImpl(`${API}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: headers(args.token),
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: commit.sha }),
    }),
  );

  const pull = (await readJson(
    await fetchImpl(`${API}/repos/${repo}/pulls`, {
      method: "POST",
      headers: headers(args.token),
      body: JSON.stringify({
        title: args.title,
        head: args.branch,
        base: args.base,
        body: args.body,
      }),
    }),
  )) as { html_url?: string };
  if (!pull.html_url) throw new Error("github");
  const url = new URL(pull.html_url);
  if (url.origin !== "https://github.com" || url.username || url.password ||
      !url.pathname.startsWith(`/${repo}/pull/`) || !/^\d+$/.test(url.pathname.split("/").at(-1) ?? "") ||
      url.search || url.hash) throw new Error("github");
  return pull.html_url;
}
