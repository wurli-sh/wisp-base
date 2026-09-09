import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/send",
  "/inbox",
  "/faucet",
  "/claim",
  "/c",
  "/register",
  "/account",
  "/balance",
  "/status",
  "/how-it-works",
  "/mainnet-demo",
  "/withdraw",
] as const;

test.describe("route shells", () => {
  for (const route of ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const res = await page.goto(route);
      expect(res?.ok() || res?.status() === 304 || res?.status() === 307 || res?.status() === 308).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }
});

test("landing shows Base Sepolia badge and opens send prefill", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Base Sepolia/i).first()).toBeVisible();
  await page.getByLabel("Recipient").fill("friend@example.com");
  await page.getByTestId("cta-send").click();
  await expect(page).toHaveURL(/\/send/);
});
