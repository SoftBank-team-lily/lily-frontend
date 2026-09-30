import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PNG } from "pngjs";
import { openReference } from "./reference";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`원본 꽃 비교 ${viewport.width}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
    await page.evaluate(() => document.fonts.ready);
    const reference = await openReference(context, viewport, true);
    await expect(reference.getByRole("textbox")).toBeVisible();
    // 마스크 로드·첫 프레임을 기다립니다. DOM 확인만으로 꽃 로드를 판정하지 않습니다.
    await reference.waitForFunction(() =>
      performance
        .getEntriesByType("resource")
        .some((entry) => entry.name.includes("three.min.js")),
    );
    await reference.waitForTimeout(500);
    for (const state of ["initial", "success", "rollback"]) {
      if (state !== "initial") {
        await Promise.all(
          [page, reference].map(async (target) => {
            if (state === "rollback") {
              await target
                .getByRole("button", { name: "다시 배포하기" })
                .click();
              await target.getByRole("checkbox").check();
            }
            await target.getByRole("textbox").fill("o/next.js");
            await target.getByRole("button", { name: "배포 시작" }).click();
            await expect(
              target.getByRole("button", { name: "다시 배포하기" }),
            ).toBeVisible({ timeout: 20000 });
          }),
        );
      }
      await page.waitForTimeout(100);
      const actual = await page.screenshot(),
        expected = await reference.screenshot();
      await testInfo.attach(`${state}-app`, {
        body: actual,
        contentType: "image/png",
      });
      await testInfo.attach(`${state}-reference`, {
        body: expected,
        contentType: "image/png",
      });
      // 난수가 다른 입자는 총 밝기를 보조 지표로 비교합니다.
      const a = PNG.sync.read(actual),
        b = PNG.sync.read(expected);
      const flux = (png: PNG) => {
        let sum = 0;
        for (let y = 60; y < viewport.height * 0.48; y++)
          for (
            let x = (viewport.width * 0.1) | 0;
            x < viewport.width * 0.9;
            x++
          ) {
            const offset = (y * png.width + x) * 4;
            sum +=
              png.data[offset] + png.data[offset + 1] + png.data[offset + 2];
          }
        return sum;
      };
      const ratio = flux(a) / flux(b);
      console.log("꽃 밝기 비율", viewport.width, state, ratio);
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.2);
      await testInfo.attach(`${state}-metrics`, {
        body: JSON.stringify({ ratio }),
        contentType: "application/json",
      });
    }
    await reference.close();
  });
}

test("초기·오류·성공·롤백 접근성", async ({ page }) => {
  await page.goto("/");
  for (const state of ["initial", "error", "success", "rollback"]) {
    if (state === "error") {
      await page.getByRole("textbox").fill("bad");
      await page.getByRole("button", { name: "배포 시작" }).click();
    } else if (state === "success" || state === "rollback") {
      if (state === "rollback") {
        await page.getByRole("button", { name: "다시 배포하기" }).click();
        await page.getByRole("checkbox").check();
      }
      await page.getByRole("textbox").fill("o/r");
      await page.getByRole("button", { name: "배포 시작" }).click();
      await expect(
        page.getByRole("button", { name: "다시 배포하기" }),
      ).toBeVisible({ timeout: 20000 });
    }
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
  }
});

test("모바일 가로 화면에서도 가로 스크롤 없이 입력할 수 있다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("textbox").fill("o/r");
  await expect(page.getByRole("button", { name: "배포 시작" })).toBeVisible();
});

test("모션 환경의 프레임 간격을 기록한다", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
  const intervals = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = 0;
        function frame(now: number) {
          if (last) times.push(now - last);
          last = now;
          if (times.length < 180) requestAnimationFrame(frame);
          else resolve(times);
        }
        requestAnimationFrame(frame);
      }),
  );
  const sorted = [...intervals].sort((a, b) => a - b);
  const metrics = {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    fps:
      1000 /
      (intervals.reduce((sum, value) => sum + value, 0) / intervals.length),
  };
  console.log("프레임 성능", metrics);
  await testInfo.attach("frames", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  expect(metrics.median).toBeLessThan(34);
});
