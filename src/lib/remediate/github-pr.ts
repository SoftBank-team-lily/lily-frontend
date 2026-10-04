import { commitSha } from "@/lib/builder/run";
import { API, headers, readJson } from "@/lib/github/github-api";

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
  const { repo } = args;
  const post = async <T,>(path: string, body: unknown) =>
    (await readJson(
      await fetchImpl(`${API}/repos/${repo}/${path}`, {
        method: "POST",
        headers: headers(args.token),
        body: JSON.stringify(body),
      }),
    )) as T;

  // 부모 커밋과 파일 blob 은 서로 기다릴 필요가 없다
  const [parent, blobs] = await Promise.all([
    readJson(
      await fetchImpl(`${API}/repos/${repo}/git/commits/${args.commit}`, { headers: headers(args.token) }),
    ) as Promise<{ tree?: { sha?: string } }>,
    Promise.all(args.files.map((file) =>
      post<{ sha?: string }>("git/blobs", { content: file.content, encoding: "utf-8" }))),
  ]);
  const baseTree = parent.tree?.sha;
  if (!baseTree || blobs.some((blob) => !blob.sha)) throw new Error("github");
  const tree = args.files.map((file, index) =>
    ({ path: file.path, mode: "100644", type: "blob", sha: blobs[index].sha }));

  const nextTree = await post<{ sha?: string }>("git/trees", { base_tree: baseTree, tree });
  if (!nextTree.sha) throw new Error("github");

  const commit = await post<{ sha?: string }>("git/commits",
    { message: args.title, tree: nextTree.sha, parents: [args.commit] });
  if (!commitSha(commit.sha)) throw new Error("github");

  await post("git/refs", { ref: `refs/heads/${args.branch}`, sha: commit.sha });

  const pull = await post<{ html_url?: string }>("pulls",
    { title: args.title, head: args.branch, base: args.base, body: args.body });
  if (!pull.html_url) throw new Error("github");
  const url = new URL(pull.html_url);
  if (url.origin !== "https://github.com" || url.username || url.password ||
      !url.pathname.startsWith(`/${repo}/pull/`) || !/^\d+$/.test(url.pathname.split("/").at(-1) ?? "") ||
      url.search || url.hash) throw new Error("github");
  return pull.html_url;
}
