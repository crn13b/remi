import { test, expect, type Page } from "@playwright/test";

// The app is a multi-page site: index.html (login) → dashboard.html (SPA with tab nav).
// Login form opens via "Login" link, uses #auth-email / #auth-password inputs.
// Dashboard has a ~5s splash animation before content renders.
// Sidebar may be collapsed — use hasText on parent div, not the hidden span.

test.use({ viewport: { width: 1280, height: 800 } });

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByText("Login").click();
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 10000 });
  // Wait for splash animation to finish and sidebar to render
  await page.waitForSelector("nav", { timeout: 15000 });
}

async function navigateTo(page: Page, label: string) {
  const navItem = page.locator("nav .cursor-pointer", { hasText: label });
  await navItem.click({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

test.describe("Tier matrix - watchlists", () => {
  test("free user cannot create additional watchlists", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await navigateTo(page, "Watchlist");
    // Open the watchlist dropdown to reveal Create New List button
    await page.getByRole("button", { name: /my watchlist/i }).click();
    await page.waitForTimeout(500);
    const createBtn = page.getByRole("button", { name: /create new list/i });
    await expect(createBtn).toBeDisabled({ timeout: 5000 });
  });

  test("core user can create watchlists", async ({ page }) => {
    await login(page, "core@test.remi", "TestPass123!");
    await navigateTo(page, "Watchlist");
    await page.getByRole("button", { name: /my watchlist/i }).click();
    await page.waitForTimeout(500);
    const createBtn = page.getByRole("button", { name: /create new list/i });
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
  });

  test("pro user can create watchlists", async ({ page }) => {
    await login(page, "pro@test.remi", "TestPass123!");
    await navigateTo(page, "Watchlist");
    await page.getByRole("button", { name: /my watchlist/i }).click();
    await page.waitForTimeout(500);
    const createBtn = page.getByRole("button", { name: /create new list/i });
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
  });
});

test.describe("Tier matrix - alerts", () => {
  test("free fresh user sees trial banner", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await navigateTo(page, "Alerts");
    await expect(page.getByText(/alert trial/i)).toBeVisible({ timeout: 5000 });
  });

  test("free expired user sees trial expired message", async ({ page }) => {
    await login(page, "free-expired@test.remi", "TestPass123!");
    await navigateTo(page, "Alerts");
    await expect(page.getByText(/trial has expired/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Tier matrix - score lookups", () => {
  test("free user sees daily lookup quota", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await expect(page.getByText(/Daily lookups remaining/i)).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Tier matrix - owner", () => {
  test("owner sees Engine tab and no lookup quota", async ({ page }) => {
    await login(page, "owner@test.remi", "TestPass123!");
    // Owner gets Engine tab in sidebar
    const engineNav = page.locator("nav .cursor-pointer", { hasText: "Engine" });
    await expect(engineNav).toHaveCount(1, { timeout: 15000 });
    // Owner has unlimited lookups — no "remaining" indicator
    await expect(page.getByText(/Daily lookups remaining/i)).toHaveCount(0);
  });
});
