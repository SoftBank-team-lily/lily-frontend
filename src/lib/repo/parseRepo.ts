export function parseRepo(value: string): string | null {
  const normalized = value.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = normalized.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  return match ? `${match[1]}/${match[2]}` : null;
}
