import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app, emptyArt, communityBadge, officialRoles, tbLogo, bmrLogo, snvLogo] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/empty-town-vignette.png", import.meta.url)),
  readFile(new URL("../assets/community-created-content.png", import.meta.url)),
  readFile(new URL("../assets/official-roles.json", import.meta.url), "utf8"),
  readFile(new URL("../assets/script-tb.webp", import.meta.url)),
  readFile(new URL("../assets/script-bmr.webp", import.meta.url)),
  readFile(new URL("../assets/script-snv.webp", import.meta.url))
]);

test("the official Community Created Content badge identifies the site as unofficial", () => {
  assert.match(html, /assets\/community-created-content\.png/);
  assert.match(html, /alt="Community Created Content"/);
  assert.match(html, /class="ccc-badge"[^>]+community-created-content-policy/);
  assert.match(html, /Unofficial community tool/);
  assert.deepEqual([...communityBadge.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("session creation supports recurring date series, multiple Storytellers and built-in base scripts", () => {
  assert.match(html, /id="generateDateSeries"/);
  assert.match(html, /value="daily">Every day/);
  assert.match(html, /value="weekly" selected>Every week/);
  assert.match(html, /value="monthly">Every month/);
  assert.equal(html.split('name="storytellerNames"').length - 1, 2);
  assert.match(html, /name="scriptChoice" value="tb"/);
  assert.match(html, /name="scriptChoice" value="bmr"/);
  assert.match(html, /name="scriptChoice" value="snv"/);
  assert.match(app, /function builtInScriptData/);
  assert.match(app, /assets\/official-roles\.json/);
  const roles = JSON.parse(officialRoles);
  const baseTeams = new Set(["townsfolk", "outsider", "minion", "demon"]);
  assert.deepEqual(Object.fromEntries(["tb", "bmr", "snv"].map(edition => [edition, roles.filter(role => role.edition === edition && baseTeams.has(role.team)).length])), { tb: 22, bmr: 25, snv: 25 });
  for (const logo of [tbLogo, bmrLogo, snvLogo]) {
    assert.equal(logo.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(logo.subarray(8, 12).toString("ascii"), "WEBP");
  }
});

test("admins have an organiser directory with direct session management", () => {
  assert.match(html, /data-dashboard-tab="organizers"/);
  assert.match(app, /function renderOrganiserDirectory/);
  assert.match(app, /collection\(firebase\.db, "users"\)/);
  assert.match(app, /currentProfile\?\.role === "admin"/);
});

test("player experience levels are explained at selection and roster review", () => {
  assert.match(app, /Beginner: "New to the game or still learning the ropes\."/);
  assert.match(app, /Experienced: "Has played before and is comfortable with the basic rules\."/);
  assert.match(app, /Expert: "A Storyteller or player who has played extensively\."/);
  assert.match(app, /function renderExperienceGuide/);
  assert.match(app, /function renderExperienceBadge/);
  assert.match(app, /Experience level guide/);
  assert.match(css, /\.experience-guide/);
  assert.match(css, /\.experience-badge\.experience-beginner/);
  assert.match(css, /\.experience-badge\.experience-experienced/);
  assert.match(css, /\.experience-badge\.experience-expert/);
});

test("homepage links to the Chaos playlist and complete tutorial", () => {
  const playlist = "PLpw9gMGspkwSc155CHY0HjyAq5_BYGGra";
  assert.equal(html.split(playlist).length - 1, 2);
  assert.match(html, /id="guideView"/);
  assert.equal(html.split('class="guide-step panel"').length - 1, 10);
  assert.match(html, /Learn how to use the system/);
  assert.match(html, /Built for busy Storytellers/);
});

test("hero uses one stable looping glitch treatment", () => {
  assert.match(app, /classList\.add\("effect-glitch"\)/);
  assert.doesNotMatch(app, /effects\[randomValue/);
  assert.match(css, /logo-glitch-main 7\.5s/);
});

test("script printing targets a compact single landscape sheet", () => {
  assert.match(css, /@page \{ size: A4 landscape; margin: 5mm; \}/);
  assert.match(css, /script-team-townsfolk \{ grid-column: span 2; \}/);
  assert.match(css, /body\.printing-script \.no-print \{ display: none !important; \}/);
  assert.match(app, /class="print-script-footer"/);
});

test("events have a visible and manager-editable difficulty signal", () => {
  assert.match(html, /name="difficulty" value="Beginner" checked/);
  assert.match(html, /name="difficulty" value="Intermediate"/);
  assert.match(html, /name="difficulty" value="Advanced"/);
  assert.match(html, /Features the three base scripts/);
  assert.match(app, /Experienced: "Intermediate", Expert: "Advanced"/);
  assert.match(app, /function renderDifficultyBadge/);
  assert.match(app, /id="sessionDifficulty"/);
  assert.match(app, /updateSessionDifficulty/);
  assert.match(css, /\.difficulty-picker/);
  assert.match(css, /\.difficulty-badge\.difficulty-intermediate/);
  assert.match(css, /\.difficulty-badge\.difficulty-advanced/);
});

test("new scripts avoid external PDFs and homebrew characters use initials", () => {
  assert.doesNotMatch(html, /name="scriptSource"/);
  assert.doesNotMatch(html, /name="scriptUrl"/);
  assert.doesNotMatch(app, /name="plannedSource"/);
  assert.match(html, /homebrew characters use their initial/i);
  assert.match(app, /sourceType: "json", pdfUrl: ""/);
  assert.match(app, /function officialTokenUrl/);
});

test("event management supports lifecycle, duplication, calendar, and compact script controls", () => {
  assert.match(html, /id="editSessionDialog"/);
  assert.match(html, /id="createTimezone"/);
  assert.match(app, /function updateSessionStatus/);
  assert.match(app, /function duplicateSession/);
  assert.match(app, /function downloadCalendar/);
  assert.match(app, /data-remove-script/);
  assert.match(app, /data-move-script/);
  assert.match(app, /data-prefer-script/);
});

test("capacity and date planning expose waitlists and a manager heatmap", () => {
  assert.match(app, /interestStatus === "waitlist"/);
  assert.match(app, /Join the waitlist/);
  assert.match(app, /function promoteWaitlistedPlayer/);
  assert.match(app, /function renderAvailabilityHeatmap/);
  assert.match(css, /\.availability-table/);
});

test("the cosmetic layer keeps controls contained and gives empty states a local PNG", () => {
  assert.match(app, /class="manager-more-menu"/);
  assert.match(app, /class="script-management"/);
  assert.match(app, /script-team-strip/);
  assert.match(app, /Best fit/);
  assert.match(app, /assets\/empty-town-vignette\.png/);
  assert.deepEqual([...emptyArt.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(emptyArt.length < 750_000);
});
