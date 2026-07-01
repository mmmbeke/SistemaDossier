import { test, expect } from "@playwright/test";

test.describe("API pública", () => {
  test("health responde ok", async ({ request }) => {
    const api = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
    const res = await request.get(`${api}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

test.describe("Login UI", () => {
  test("página de login carga", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("login inválido muestra error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill("noexiste@example.com");
    await page.locator('input[type="password"]').first().fill("WrongPassword99!");
    await page.getByRole("button", { name: /iniciar|log in|sign in/i }).click();
    // Debe permanecer en login o mostrar mensaje de error
    await expect(page).toHaveURL(/login/);
  });
});

test.describe("Dashboard (sin sesión)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("redirige a login si no hay token", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
