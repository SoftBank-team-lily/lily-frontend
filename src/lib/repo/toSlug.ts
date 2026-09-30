export function toSlug(repo: string): string {
  return repo.split("/").at(-1)!.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
