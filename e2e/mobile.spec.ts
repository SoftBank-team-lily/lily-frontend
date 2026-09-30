import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`WebKit 모바일 배포 흐름 ${viewport.width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#gl")).toHaveAttribute("data-state", "ready");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("textbox").fill("o/r");
    await page.getByRole("button", { name: "배포 시작" }).click();
    await expect(page.getByText("배포 완료")).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "다시 배포하기" }).click();
    await expect(page.getByRole("textbox")).toBeFocused();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "배포 시작" }).click();
    await expect(page.getByText("이전 버전으로 되돌렸어요")).toBeVisible({
      timeout: 20000,
    });
    expect(errors).toEqual([]);
  });
}
