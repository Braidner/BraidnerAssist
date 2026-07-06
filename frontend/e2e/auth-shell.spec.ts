import { expect, test } from "@playwright/test";

test("renders the Mission Control auth shell", async ({ page }) => {
  await page.route("**/api/auth/setup-status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ setupRequired: false }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Mission Control")).toBeVisible();
  await expect(page.getByPlaceholder("username")).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Войти|Создать администратора/ }),
  ).toBeVisible();
});
