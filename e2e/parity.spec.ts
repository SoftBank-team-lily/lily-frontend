import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { openReference } from "./reference";

for (const state of ["초기", "오류", "성공", "롤백"])
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`${state} 화면 ${viewport.width}`, async ({
      page,
      context,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      const cdp = await context.newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const { root } = await cdp.send("DOM.getDocument");
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: "h2",
      });
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
        nodeId,
      });
      expect(
        fonts.some(
          (font) => font.isCustomFont && font.familyName.includes("Plex"),
        ),
      ).toBe(true);
      await cdp.detach();
      await expect(page.locator("#deploy")).toHaveAttribute(
        "data-visible",
        "true",
      );
      const reference = await openReference(context, viewport);
      await Promise.all(
        [page, reference].map(async (target) => {
          if (state === "초기") return;
          await target
            .getByRole("textbox")
            .fill(state === "오류" ? "bad" : "o/next.js");
          if (state === "롤백") await target.getByRole("checkbox").check();
          await target.getByRole("button", { name: "배포 시작" }).click();
          if (state === "성공" || state === "롤백")
            await expect(
              target.getByRole("button", { name: "다시 배포하기" }),
            ).toBeVisible({ timeout: 20000 });
        }),
      );
      // 숨기는 대상은 배경 캔버스뿐이며 DOM은 그대로 비교한다.
      await reference
        .locator("canvas")
        .evaluate((element) => (element.style.visibility = "hidden"));
      await page
        .locator("canvas")
        .evaluateAll((elements) =>
          elements.forEach((element) => (element.style.visibility = "hidden")),
        );
      const actual = await page.screenshot();
      const expected = await reference.screenshot();
      await writeFile(testInfo.outputPath("app.png"), actual);
      await writeFile(testInfo.outputPath("reference.png"), expected);
      const a = PNG.sync.read(actual),
        b = PNG.sync.read(expected);
      const diff = new PNG({ width: a.width, height: a.height });
      const count = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
        threshold: 0.2,
      });
      await testInfo.attach("app", { body: actual, contentType: "image/png" });
      await testInfo.attach("reference", {
        body: expected,
        contentType: "image/png",
      });
      await testInfo.attach("diff", {
        body: PNG.sync.write(diff),
        contentType: "image/png",
      });
      await writeFile(testInfo.outputPath("diff.png"), PNG.sync.write(diff));
      console.log("pixel ratio", viewport.width, count / (a.width * a.height));
      expect(count / (a.width * a.height)).toBeLessThanOrEqual(0.001);
      await reference.close();
    });
  }
