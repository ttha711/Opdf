import { expect, test } from "@playwright/test";

test("home defers PDF and font engines until a document is opened", async ({ page }) => {
  const eagerResources: string[] = [];
  page.on("request", (request) => {
    if (/pdfium.*\.wasm|pdf\.worker|fontkit|NotoSans/i.test(request.url())) {
      eagerResources.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose PDF file to open" })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return true;
  });
  await page.waitForLoadState("networkidle");
  expect(eagerResources).toEqual([]);
});
