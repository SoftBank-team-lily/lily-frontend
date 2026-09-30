import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`꽃 렌더링과 정지 상태 ${viewport.width}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" || /Too many active WebGL|꽃 캔버스/.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize(viewport); await page.goto("/");
    await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
    await page.evaluate(() => document.fonts.ready);
    const count = Number(await page.locator("#gl").getAttribute("data-particles"));
    expect(count).toBeGreaterThan(viewport.width < 700 ? 20000 : 40000);
    console.log("꽃 입자 수", viewport.width, count);
    await expect(page.locator("canvas")).toHaveCount(1);
    const a = await page.screenshot();
    // reduced motion에서는 시간이 흘러도 꽃이 정지한다.
    await page.mouse.move(viewport.width - 10, 10);
    await page.waitForTimeout(300);
    expect(await page.screenshot()).toEqual(a);
    await testInfo.attach("flower", { body: a, contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}

test("개발 모드 반복 진입 시 WebGL 컨텍스트 경고가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (/Too many active WebGL|꽃 캔버스/.test(message.text())) errors.push(message.text()); });
  for (let i = 0; i < 10; i++) {
    await page.goto("/");
    await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("배포·롤백·재시작 동안 같은 캔버스를 유지한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto("/");
  await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
  await page.evaluate(() => document.fonts.ready);
  const canvas = await page.locator("#gl").elementHandle();
  const clip = { x: 250, y: 60, width: 940, height: 380 };
  const idle = await page.screenshot({ clip });
  await page.getByRole("textbox").fill("o/next.js");
  await page.getByRole("button", { name: "배포 시작" }).click();
  await expect(page.getByRole("button", { name: "다시 배포하기" })).toBeVisible({ timeout: 20000 });
  const succeeded = await page.screenshot({ clip });
  expect(succeeded).not.toEqual(idle);
  expect(await page.evaluate(canvas => canvas === document.querySelector("#gl"), canvas)).toBe(true);
  await page.getByRole("button", { name: "다시 배포하기" }).click();
  await expect(page.getByRole("textbox")).toBeFocused();
  await page.waitForTimeout(100);
  expect(await page.screenshot({ clip })).toEqual(idle);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "배포 시작" }).click();
  await expect(page.getByText("이전 버전으로 되돌렸어요")).toBeVisible({ timeout: 20000 });
  const rolledBack = await page.screenshot({ clip });
  expect(rolledBack).not.toEqual(succeeded);
  expect(await page.evaluate(canvas => canvas === document.querySelector("#gl"), canvas)).toBe(true);
  await testInfo.attach("success", { body: succeeded, contentType: "image/png" });
  await testInfo.attach("rollback", { body: rolledBack, contentType: "image/png" });
});
