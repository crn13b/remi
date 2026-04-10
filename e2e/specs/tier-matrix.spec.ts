import { test, expect } from "@playwright/test";

async function login(page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard|home|app/);
}

test.describe("Tier matrix - watchlists", () => {
  test("free user is capped at 1 watchlist of 3 tickers", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await page.goto("/watchlist");
    await expect(page.getByRole("button", { name: /new watchlist/i })).toBeDisabled();
    for (const sym of ["BTC", "ETH", "SOL"]) {
      await page.getByRole("button", { name: /add ticker/i }).click();
      await page.getByLabel(/symbol/i).fill(sym);
      await page.getByRole("button", { name: /add$/i }).click();
    }
    await expect(page.getByRole("button", { name: /add ticker/i })).toBeDisabled();
  });

  test("core user can create 3 watchlists with unlimited tickers", async ({ page }) => {
    await login(page, "core@test.remi", "TestPass123!");
    await page.goto("/watchlist");
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /new watchlist/i }).click();
      await page.getByLabel(/name/i).fill(`List ${i + 1}`);
      await page.getByRole("button", { name: /create/i }).click();
    }
    await expect(page.getByRole("button", { name: /new watchlist/i })).toBeDisabled();
  });

  test("pro user has unlimited watchlists", async ({ page }) => {
    await login(page, "pro@test.remi", "TestPass123!");
    await page.goto("/watchlist");
    await expect(page.getByRole("button", { name: /new watchlist/i })).toBeEnabled();
  });
});

test.describe("Tier matrix - alerts", () => {
  test("free fresh user can create 1 alert and is blocked on second ticker", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await page.goto("/alerts");
    await page.getByRole("button", { name: /add alert/i }).click();
    await page.getByLabel(/symbol/i).fill("BTC");
    await page.getByRole("button", { name: /create/i }).click();
    await expect(page.getByText(/BTC/)).toBeVisible();
    await page.getByRole("button", { name: /add alert/i }).click();
    await page.getByLabel(/symbol/i).fill("ETH");
    await page.getByRole("button", { name: /create/i }).click();
    await expect(page.getByText(/upgrade to core|ticker/i)).toBeVisible();
  });

  test("free expired user cannot create alerts", async ({ page }) => {
    await login(page, "free-expired@test.remi", "TestPass123!");
    await page.goto("/alerts");
    await expect(page.getByText(/trial.*expired/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /add alert/i })).toBeDisabled();
  });
});

test.describe("Tier matrix - notification channels", () => {
  test("free user does not see Discord/Telegram toggles", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await page.goto("/settings");
    await expect(page.getByLabel(/discord/i)).toHaveCount(0);
    await expect(page.getByLabel(/telegram/i)).toHaveCount(0);
  });

  test("core user sees all channel toggles", async ({ page }) => {
    await login(page, "core@test.remi", "TestPass123!");
    await page.goto("/settings");
    await expect(page.getByLabel(/discord/i)).toBeVisible();
    await expect(page.getByLabel(/telegram/i)).toBeVisible();
  });
});

test.describe("Tier matrix - score lookups", () => {
  test("free user has 5/day lookup quota indicator", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await page.goto("/dashboard");
    await expect(page.getByText(/5\/5|remaining: 5/i)).toBeVisible();
  });

  test("free user blocked on watchlisted symbol lookup", async ({ page }) => {
    await login(page, "free-fresh@test.remi", "TestPass123!");
    await page.goto("/dashboard");
    await page.getByLabel(/lookup/i).fill("BTC");
    await page.getByRole("button", { name: /look up/i }).click();
    await expect(page.getByText(/in your watchlist/i)).toBeVisible();
  });
});

test.describe("Tier matrix - founding member", () => {
  test("founder sees the founding-member badge but not engine inspector", async ({ page }) => {
    await login(page, "founder@test.remi", "TestPass123!");
    await page.goto("/dashboard");
    await expect(page.getByTestId("founding-badge")).toBeVisible();
    await expect(page.getByTestId("engine-inspector")).toHaveCount(0);
  });
});

test.describe("Tier matrix - owner", () => {
  test("owner on free plan gets unlimited everything and engine inspector", async ({ page }) => {
    await login(page, "owner@test.remi", "TestPass123!");
    await page.goto("/dashboard");
    await expect(page.getByTestId("engine-inspector")).toBeVisible();
    await expect(page.getByTestId("founding-badge")).toHaveCount(0);
    await expect(page.getByText(/remaining/i)).toHaveCount(0);
  });
});
