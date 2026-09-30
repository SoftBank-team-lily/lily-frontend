import type { BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const resolveModule = createRequire(`${process.cwd()}/package.json`);

export async function openReference(
  context: BrowserContext,
  viewport: { width: number; height: number },
  flower = false,
) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  let html = await readFile("docs/reference/landing.html", "utf8");
  if (flower) {
    const script = await readFile(
      resolveModule.resolve("three-reference").replace(/three\.js$/, "three.min.js"),
      "utf8",
    );
    await page.route("https://cdnjs.cloudflare.com/**", (route) =>
      route.fulfill({ contentType: "text/javascript", body: script }),
    );
  } else {
    html = html.replace(
      /const IMG = [\s\S]*?\/\/ ---- 배포 시연 ----/,
      "const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; let progTarget = 0, wiltTarget = 0; // ---- 배포 시연 ----",
    );
    await page.route("https://cdnjs.cloudflare.com/**", (route) =>
      route.abort(),
    );
  }
  await page.route("**/reference", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("http://127.0.0.1:3210/reference");
  await page.evaluate(() => document.fonts.ready);
  return page;
}
