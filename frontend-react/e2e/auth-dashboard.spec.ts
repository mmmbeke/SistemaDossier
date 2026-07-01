import { test, expect } from "@playwright/test";

const email = process.env.TEST_LOGIN_EMAIL || process.env.PLAYWRIGHT_TEST_EMAIL;
const password = process.env.TEST_LOGIN_PASSWORD || process.env.PLAYWRIGHT_TEST_PASSWORD;

test.describe("Dashboard autenticado", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, "Define TEST_LOGIN_EMAIL y TEST_LOGIN_PASSWORD");

    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(email!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test("overview carga tras login", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
  });

  test("listado de dossiers accesible", async ({ page }) => {
    await page.goto("/dashboard/dossiers");
    await expect(page).toHaveURL(/\/dashboard\/dossiers/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("investigación de persona accesible", async ({ page }) => {
    await page.goto("/dashboard/person-research");
    await expect(page).toHaveURL(/\/dashboard\/person-research/);
    await expect(page.locator('input, textarea, button').first()).toBeVisible();
  });

  test("campana de notificaciones visible", async ({ page }) => {
    const bell = page.getByRole("button", { name: /notificaciones|notifications/i });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByText(/notificaciones|notifications/i).first()).toBeVisible();
  });
});
