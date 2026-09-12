import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu", "--disable-software-rasterizer", "--disable-features=VizDisplayCompositor"] });
const pageErrors = [];

function watchErrors(page, label) {
  page.on("pageerror", error => pageErrors.push(`${label}: ${error.message}`));
}

async function assertFits(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${label} document overflows: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body <= dimensions.viewport + 1, `${label} body overflows: ${JSON.stringify(dimensions)}`);
}

try {
  for (const viewport of [{ width: 390, height: 844, name: "mobile" }, { width: 1440, height: 1000, name: "desktop" }]) {
    const page = await browser.newPage({ viewport });
    watchErrors(page, viewport.name);
    await page.goto("http://127.0.0.1:4173/?demo=1&session=sample-night", { waitUntil: "networkidle" });
    await page.locator(".session-hero h1").waitFor();
    await assertFits(page, `${viewport.name} player view`);
    await page.screenshot({ path: `qa-${viewport.name}.png`, fullPage: true });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watchErrors(page, "manager");
  await page.goto("http://127.0.0.1:4173/?demo=1", { waitUntil: "networkidle" });
  await page.locator("#dashboardButton").click();
  await page.locator("[data-open-session]").first().click();
  await page.locator("[data-edit-session]").waitFor();
  assert.equal(await page.locator("[data-duplicate-session]").count(), 1);
  assert.equal(await page.locator("[data-session-status='closed']").count(), 1);
  assert.equal(await page.locator("[data-remove-script]").count(), 2);
  await page.locator("[data-edit-session]").click();
  await page.locator("#editSessionDialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#editSessionForm [name='title']").inputValue(), "A night in Ravenswood Bluff");
  await page.keyboard.press("Escape");
  await page.locator("#playerForm input[name='displayName']").fill("QA Player");
  await page.locator("#playerForm select[name='experience']").selectOption("Experienced");
  for (const select of await page.locator("#playerForm select[name^='manager-response']").all()) await select.selectOption("available");
  await page.locator("#playerForm input[name='consent']").check();
  await page.locator("#playerForm button[type='submit']").click();
  await page.locator(".availability-table").waitFor();
  assert.equal(await page.locator(".availability-table tbody tr").count(), 1);
  await assertFits(page, "desktop manager view");
  await page.screenshot({ path: "qa-manager.png", fullPage: true });
  await page.locator("[data-duplicate-session]").click();
  await page.locator(".session-hero h1").filter({ hasText: "(Copy)" }).waitFor();
  assert.match(await page.locator(".manager-registrations summary").innerText(), /0 total/);
  assert.deepEqual(pageErrors, []);
  await page.close();
  console.log("QA passed: desktop, 390px mobile, manager controls, player heatmap, duplication, dialogs, and horizontal-overflow checks.");
} finally {
  await browser.close();
}
