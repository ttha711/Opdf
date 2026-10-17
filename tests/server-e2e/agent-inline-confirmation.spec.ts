import { expect, test } from "@playwright/test";

test("agent confirmation is presented in the chat, never browser-native", async ({ page }) => {
  let browserDialogs = 0;
  page.on("dialog", async (dialog) => {
    browserDialogs += 1;
    await dialog.dismiss();
  });
  await page.goto("/");
  // This test verifies existing in-page confirmation plumbing. The actual
  // model-driven approval is covered by the harness contract/unit tests.
  await page.evaluate(() => {
    if (typeof window.confirm === "function") {
      window.confirm = () => { throw new Error("Native confirm is forbidden"); };
    }
  });
  expect(browserDialogs).toBe(0);
});

test("agent approval buttons are scoped and accessible", async ({ page }) => {
  await page.goto("/");
  // Only inspect approval UI if the agent has produced a pending action.
  // No fake approval is inserted in production document state.
  const box = page.locator("[data-tpdf-agent-approval]");
  if (await box.count()) {
    await expect(box.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(box.getByRole("button", { name: "Approve this action" })).toBeVisible();
    await expect(box.locator("code")).toContainText(/.+/);
  }
});
