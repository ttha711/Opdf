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


test("authenticated home paints without waiting for the projects endpoint", async ({ page }) => {
  let projectsRequested = false;
  await page.route("**/api/tpdf/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "perf-user", email: "perf@example.test", role: "user", quotaBytes: 1000000 },
        projectId: "default",
        quota: { usedBytes: 0, quotaBytes: 1000000, availableBytes: 1000000, percentUsed: 0 },
      }),
    });
  });
  // Keep the optional list pending: the home UI should still render.
  await page.route("**/api/tpdf/projects", () => {
    projectsRequested = true;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toBeVisible();
  await expect.poll(() => projectsRequested).toBe(true);
});

test("first-paint hero is in HTML before application JS and is removed after home mounts", async ({ page }) => {
  await page.route("**/assets/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tpdf-first-paint h1")).toHaveText("Your documents, ready when you are.");
  await expect(page.getByRole("button", { name: "Choose PDF file to open" })).toBeVisible();
  await expect(page.locator("#tpdf-first-paint")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toHaveCount(1);
});

test("unauthenticated sign-in clears the first-paint placeholder", async ({ page }) => {
  await page.route("**/api/tpdf/auth/me", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to TPDF" })).toBeVisible();
  await expect(page.locator("#tpdf-first-paint")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toHaveCount(0);
});
