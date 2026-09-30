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
