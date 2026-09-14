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
    if (viewport.name === "desktop") {
      assert.equal(await page.locator(".header-resources a:visible").count(), 2);
      await page.waitForFunction(() => [...document.querySelectorAll(".header-resources img")].every(image => image.complete && image.naturalWidth > 0));
    }
    if (viewport.name === "mobile") assert.equal(await page.locator(".header-resources a:visible").count(), 0);
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
  await page.locator("#playerForm select[name='experience']").selectOption("Repeat Offender");
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

  for (const viewport of [{ width: 390, height: 844, name: "mobile" }, { width: 1440, height: 900, name: "desktop" }]) {
    const watchPage = await browser.newPage({ viewport });
    watchErrors(watchPage, `${viewport.name} episodes`);
    await watchPage.goto("http://127.0.0.1:4173/?demo=1&watch=1", { waitUntil: "domcontentloaded" });
    await watchPage.locator("#watchView:not([hidden]) .theatre-poster").waitFor();
    assert.equal(await watchPage.locator(".episode-card").count(), 16);
    await watchPage.waitForFunction(() => [...document.querySelectorAll(".episode-card img")].slice(0, 3).every(image => image.complete && image.naturalWidth > 0));
    await assertFits(watchPage, `${viewport.name} episode player`);
    await watchPage.screenshot({ path: `qa-watch-${viewport.name}.png`, fullPage: true });
    assert.match(await watchPage.locator(".episode-card").first().getAttribute("aria-label"), /Episode 1:/);
    assert.match(await watchPage.locator(".episode-card").last().getAttribute("aria-label"), /Episode 16:/);
    await watchPage.locator('.episode-card[aria-label^="View Episode 1:"]').click();
    assert.match(await watchPage.locator("#episodeScriptsPanel").innerText(), /Catfishing/);
    assert.match(await watchPage.locator("#episodeScriptsPanel").innerText(), /Kaboom!/);
    assert.equal(await watchPage.locator(".episode-timestamp").count(), 2);
    assert.equal(await watchPage.locator(".episode-script-resource").count(), 0);
    assert.deepEqual(await watchPage.locator(".episode-timestamp").evaluateAll(buttons => buttons.map(button => button.dataset.startSeconds)), ["297", "5176"]);
    assert.deepEqual(await watchPage.locator(".episode-timestamp").allTextContents(), ["Catfishing", "Kaboom!"]);
    await assertFits(watchPage, `${viewport.name} episode scripts`);
    await watchPage.screenshot({ path: `qa-watch-scripts-${viewport.name}.png`, fullPage: true });
    await watchPage.locator(".episode-timestamp").first().click();
    await watchPage.locator(".episode-player-frame iframe").waitFor();
    assert.match(await watchPage.locator(".episode-player-frame iframe").getAttribute("src"), /start=297/);
    assert.equal(await watchPage.locator("#episodeScriptsPanel .episode-timestamp").count(), 2);
    await watchPage.locator('.episode-card[aria-label^="View Episode 14:"]').click();
    assert.equal(await watchPage.locator(".episode-player-frame iframe").count(), 0);
    assert.match(await watchPage.locator(".episode-dossier-art").getAttribute("src"), /Oiqgyiskbe8\.jpg/);
    assert.match(await watchPage.locator(".episode-dossier-body").innerText(), /Chaos, Assemble/);
    assert.match(await watchPage.locator("#episodeScriptsPanel").innerText(), /scripts this episode/i);
    await watchPage.screenshot({ path: `qa-watch-preview-${viewport.name}.png`, fullPage: true });
    await watchPage.locator("[data-play-episode='13']").click();
    await watchPage.locator(".episode-player-frame iframe").waitFor();
    assert.match(await watchPage.locator(".episode-player-frame iframe").getAttribute("src"), /youtube-nocookie\.com\/embed\/Oiqgyiskbe8/);
    assert.equal(await watchPage.locator(".episode-card.is-active").count(), 1);
    assert.equal(await watchPage.locator(".episode-card").nth(13).getAttribute("aria-pressed"), "true");
    assert.match(await watchPage.locator("#episodeNowPlaying").innerText(), /Episode 14/);
    await assertFits(watchPage, `${viewport.name} selected episode`);
    await watchPage.close();
  }

  const guidePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watchErrors(guidePage, "mobile guide");
  await guidePage.goto("http://127.0.0.1:4173/?demo=1&guide=1", { waitUntil: "domcontentloaded" });
  await guidePage.locator("#guide-watch .guide-watch-screen").scrollIntoViewIfNeeded();
  await guidePage.waitForFunction(() => document.querySelector("#guide-watch img")?.naturalWidth > 0);
  await assertFits(guidePage, "mobile updated guide");
  await guidePage.screenshot({ path: "qa-guide-mobile.png", fullPage: true });
  await guidePage.close();

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

  const creationPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watchErrors(creationPage, "session creation");
  await creationPage.goto("http://127.0.0.1:4173/?demo=1", { waitUntil: "networkidle" });
  await creationPage.locator("#dashboardButton").click();
  await creationPage.locator("#createSessionButton").click();
  await creationPage.locator("[data-create-mode='poll']").click();
  await creationPage.locator("#createSessionForm [name='title']").fill("Recurring Ravenswood QA");
  await creationPage.locator("#createSessionForm [name='storytellerNames']").fill("Avery, Morgan");
  await creationPage.locator("#createSessionForm [name='location']").fill("The Town Square");
  await creationPage.locator("#dateSeriesStart").fill("2026-10-03T19:30");
  await creationPage.locator("#dateSeriesInterval").selectOption("weekly");
  await creationPage.locator("#dateSeriesCount").fill("4");
  await creationPage.locator("#generateDateSeries").click();
  assert.deepEqual(await creationPage.locator("#dateOptionList [name='dateOption']").evaluateAll(inputs => inputs.map(input => input.value)), ["2026-10-03T19:30", "2026-10-10T19:30", "2026-10-17T19:30", "2026-10-24T19:30"]);
  await creationPage.locator("#createSessionForm [name='scriptMode'][value='chosen']").check();
  assert.equal(await creationPage.locator(".built-in-script-picker img").count(), 3);
  await creationPage.locator("#createSessionForm button[type='submit']").click();
  await creationPage.locator(".session-hero h1").filter({ hasText: "Recurring Ravenswood QA" }).waitFor();
  assert.match(await creationPage.locator(".session-facts").innerText(), /Avery, Morgan/);
  assert.match(await creationPage.locator(".difficulty-description").innerText(), /official base scripts/i);
  assert.match(await creationPage.locator(".planned-script-card").innerText(), /Trouble Brewing/);
  assert.match(await creationPage.locator(".planned-script-card").innerText(), /22 characters/);
  await creationPage.locator(".script-edition-logo").waitFor();
  await creationPage.waitForFunction(() => document.querySelector(".script-edition-logo")?.naturalWidth > 0);
  await assertFits(creationPage, "mobile recurring session and built-in script");
  await creationPage.screenshot({ path: "qa-creation.png", fullPage: true });
  creationPage.once("dialog", dialog => dialog.accept());
  await creationPage.locator("[data-finalize]").first().click();
  await creationPage.locator("#playerForm input[name='displayName']").fill("Expert Storyteller");
  await creationPage.locator("#playerForm select[name='experience']").selectOption("Criminal Mastermind");
  await creationPage.locator("#playerForm input[name='consent']").check();
  await creationPage.locator("#playerForm button[type='submit']").click();
  await creationPage.locator(".experience-badge.experience-criminal-mastermind").first().waitFor();
  await creationPage.locator(".experience-key > summary").click();
  await assertFits(creationPage, "mobile colour-coded experience roster");
  await creationPage.close();
  assert.deepEqual(pageErrors, []);
  console.log("QA passed: desktop, 390px mobile, 16-thumbnail episode picker, manager controls, recurring dates, multi-Storytellers, built-in scripts, colour-coded experience and difficulty, player heatmap, duplication, empty states, dialogs, and horizontal-overflow checks.");
} finally {
  await browser.close();
}
