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
    await page.locator(".ccc-badge img").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".ccc-badge img")?.naturalWidth > 0);
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
  await page.locator(".manager-more-menu > summary").click();
  await page.locator(".manager-more-menu [data-delete-session]").waitFor({ state: "visible" });
  await assertFits(page, "expanded manager actions");
  await page.locator(".manager-more-menu > summary").click();
  await page.locator(".script-management > summary").click();
  await page.locator(".script-management-row").first().waitFor({ state: "visible" });
  await assertFits(page, "expanded script management");
  await page.locator(".script-management > summary").click();
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

  const emptyPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watchErrors(emptyPage, "empty state");
  await emptyPage.goto("http://127.0.0.1:4173/?demo=1", { waitUntil: "networkidle" });
  await emptyPage.locator("#dashboardButton").click();
  await emptyPage.locator(".card-more-menu > summary").first().click();
  await emptyPage.locator(".card-more-menu [data-delete-session]").first().waitFor({ state: "visible" });
  await assertFits(emptyPage, "mobile dashboard action menu");
  await emptyPage.locator(".card-more-menu > summary").first().click();
  await emptyPage.locator("#sessionSearch").fill("no event can match this");
  await emptyPage.locator(".empty-state-art").scrollIntoViewIfNeeded();
  await emptyPage.waitForFunction(() => document.querySelector(".empty-state-art")?.naturalWidth > 0);
  const emptyArtWidth = await emptyPage.locator(".empty-state-art").evaluate(image => image.naturalWidth);
  assert.ok(emptyArtWidth > 0, "empty-state PNG did not load");
  await assertFits(emptyPage, "mobile dashboard empty state");
  await emptyPage.close();

  const mobileManager = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watchErrors(mobileManager, "mobile manager");
  await mobileManager.goto("http://127.0.0.1:4173/?demo=1", { waitUntil: "networkidle" });
  await mobileManager.locator("#dashboardButton").click();
  await mobileManager.locator("[data-open-session]").first().click();
  await mobileManager.locator(".manager-more-menu > summary").click();
  await mobileManager.locator(".script-management > summary").click();
  await mobileManager.locator(".script-management-row").first().waitFor({ state: "visible" });
  await assertFits(mobileManager, "mobile expanded manager controls");
  await mobileManager.close();
  assert.deepEqual(pageErrors, []);
  console.log("QA passed: desktop, 390px mobile, manager controls, script controls, player heatmap, duplication, empty states, dialogs, and horizontal-overflow checks.");
} finally {
  await browser.close();
}
