import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rules = [
  /#[\da-f]{3,8}\b/i,
  /\b(?:rgba?|hsla?|oklch|color-mix)\s*\(/i,
  /vec3\(\s*\d*\.?\d+\s*,\s*\d*\.?\d+\s*,\s*\d*\.?\d+\s*\)/,
  /\b(?:bg|text|border|outline|accent)-(?:white|black|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d+)\b/,
  /\b(?:bg|text|border|outline|accent)-[\w-]+\/\d+/,
];

export function findViolations(source) {
  const arrays =
    /\b(?:\w*(?:color|palette)\w*|stamen|pollen|petal|spot|unlit|wilt|dust|amber|pink|blush|green)\s*(?::\s*RGB)?\s*[:=]\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/gi;
  const arrayLines = new Set();
  for (const match of source.matchAll(arrays)) {
    if (
      match.slice(1).every((value) => Number(value) >= 0 && Number(value) <= 1)
    ) {
      arrayLines.add(source.slice(0, match.index).split("\n").length - 1);
    }
  }
  return source
    .split("\n")
    .flatMap((line, index) =>
      arrayLines.has(index) || rules.some((rule) => rule.test(line))
        ? [{ line: index + 1, text: line.trim() }]
        : [],
    );
}

async function check(dir) {
  let errors = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) errors += await check(path);
    else if (/\.(?:ts|tsx|css)$/.test(path) && path !== "src/app/globals.css") {
      for (const violation of findViolations(await readFile(path, "utf8"))) {
        console.error(
          `${path}:${violation.line}: 색은 디자인 토큰을 사용하세요: ${violation.text}`,
        );
        errors++;
      }
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (await check("src")) process.exitCode = 1;
}
