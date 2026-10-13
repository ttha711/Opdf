import { expect, test } from "@playwright/test";

test("home defers PDF and font engines until a document is opened", async ({ page }) => {
  const eagerResources: string[] = [];
  const scripts: Array<Promise<number>> = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      scripts.push(response.body().then((body) => body.byteLength).catch(() => 0));
    }
  });
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
  const scriptBytes = (await Promise.all(scripts)).reduce((sum, size) => sum + size, 0);
  // The root bundle must not pull in pdf-lib again (it was ~430 KB of a ~780 KB entry).
  expect(scriptBytes).toBeLessThan(600_000);
});
