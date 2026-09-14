import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const [html, css, app, emptyArt, communityBadge, officialBotcLogo, officialAppPuck, officialRoles, tbLogo, bmrLogo, snvLogo, episodeWaxSeal] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/empty-town-vignette.png", import.meta.url)),
  readFile(new URL("../assets/community-created-content.png", import.meta.url)),
  readFile(new URL("../assets/official-botc-logo.png", import.meta.url)),
  readFile(new URL("../assets/official-app-puck.png", import.meta.url)),
  readFile(new URL("../assets/official-roles.json", import.meta.url), "utf8"),
  readFile(new URL("../assets/script-tb.webp", import.meta.url)),
  readFile(new URL("../assets/script-bmr.webp", import.meta.url)),
  readFile(new URL("../assets/script-snv.webp", import.meta.url)),
  readFile(new URL("../assets/episode-wax-seal.png", import.meta.url))
]);
const episodeThumbnails = (await readdir(new URL("../assets/episodes/", import.meta.url))).filter(name => name.endsWith(".jpg"));
const [favicon32, favicon192, favicon512, appleTouchIcon, webManifest] = await Promise.all([
  readFile(new URL("../assets/favicon-32.png", import.meta.url)),
  readFile(new URL("../assets/favicon-192.png", import.meta.url)),
  readFile(new URL("../assets/favicon-512.png", import.meta.url)),
  readFile(new URL("../assets/apple-touch-icon.png", import.meta.url)),
  readFile(new URL("../site.webmanifest", import.meta.url), "utf8")
]);

test("the site exposes branded favicons and installable app icons", () => {
  assert.match(html, /rel="icon" href="assets\/favicon\.svg/);
  assert.match(html, /rel="icon" href="assets\/favicon-32\.png/);
  assert.match(html, /rel="apple-touch-icon" href="assets\/apple-touch-icon\.png/);
  assert.match(html, /rel="manifest" href="site\.webmanifest/);
  for (const png of [favicon32, favicon192, favicon512, appleTouchIcon]) assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(JSON.parse(webManifest).name, "Chaos Planner");
});

test("the header brand is the consistent home control without redundant page rows", () => {
  assert.match(html, /class="brand" href="\.\/" data-action="home" aria-label="Chaos Planner home"/);
  assert.equal(html.match(/(?:href="\.\/"|type="button") data-action="home"/g)?.length, 1);
  assert.match(css, /\.brand:focus-visible/);
  assert.match(css, /\.guide-view, \.watch-view, \.auth-view, \.session-view \{ padding-top:/);
});

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
  assert.match(app, /"Fresh Blood": "New to Clocktower or still learning how the game flows\."/);
  assert.match(app, /"Repeat Offender": "Comfortable with the core rules and more involved mechanics such as madness, character changes and unusual information\."/);
  assert.match(app, /"Criminal Mastermind": "Highly experienced, confident interpreting unfamiliar scripts and complex interactions, or has experience as a Storyteller\."/);
  assert.match(app, /Beginner: "Fresh Blood", Experienced: "Repeat Offender", Expert: "Criminal Mastermind"/);
  assert.match(app, /function renderExperienceGuide/);
  assert.match(app, /function renderExperienceBadge/);
  assert.match(app, /Experience level guide/);
  assert.match(css, /\.experience-guide/);
  assert.match(css, /\.experience-badge\.experience-fresh-blood/);
  assert.match(css, /\.experience-badge\.experience-repeat-offender/);
  assert.match(css, /\.experience-badge\.experience-criminal-mastermind/);
});

test("homepage links to the Chaos playlist and complete tutorial", () => {
  const playlist = "PLpw9gMGspkwSc155CHY0HjyAq5_BYGGra";
  assert.ok(html.includes(playlist));
  assert.match(html, /id="guideView"/);
  assert.equal(html.split('class="guide-step panel"').length - 1, 11);
  assert.match(html, /Learn how to use the system/);
  assert.match(html, /Watch Chaos on the Clocktower/);
  assert.match(html, /All 16 episodes · No sign-in required/);
  assert.match(html, /class="home-watch-link" href="\?watch=1" data-action="watch"/);
  assert.match(html, /Built for busy Storytellers/);
  assert.match(html, /id="guide-watch"/);
  assert.match(html, /class="guide-screen guide-watch-screen"/);
});

test("episodes have a dedicated privacy-enhanced single-episode player", () => {
  assert.match(html, /id="watchView"/);
  assert.match(html, /id="episodeStage"/);
  assert.match(html, /id="episodeList"/);
  assert.match(html, /id="episodeScriptsPanel"/);
  assert.match(app, /const CHAOS_EPISODES = \[/);
  assert.equal((app.match(/videoId: "/g) || []).length, 16);
  assert.equal(episodeThumbnails.length, 16);
  assert.match(app, /sort\(\(left, right\) => left\.number - right\.number\)/);
  assert.match(app, /episode-03-hermit-havoc\.jpg/);
  assert.match(html, /assets\/chaos-theatre\.png/);
  assert.match(css, /\.episode-theatre-copy img \{ width: min\(480px, 82%\)/);
  assert.match(css, /\.episode-theatre-copy strong::before/);
  assert.match(app, /function episodeArtwork\(episode\)/);
  assert.match(app, /episode\.artwork \|\|/);
  assert.match(app, /EPISODE_ART_VERSION/);
  assert.match(app, /youtube-nocookie\.com\/embed\/\$\{episode\.videoId\}/);
  assert.doesNotMatch(app, /\?list=\$\{CHAOS_PLAYLIST_ID\}/);
  assert.doesNotMatch(app, /&index=\$\{CHAOS_EPISODES/);
  assert.match(app, /playsinline=1&fs=1/);
  assert.match(app, /encrypted-media; fullscreen;/);
  assert.match(css, /iframe:fullscreen/);
  assert.match(app, /function showEpisodeDetails/);
  assert.match(app, /function renderEpisodeScripts/);
  assert.match(app, /renderEpisodeScripts\(index\)/);
  assert.match(app, /dataset\.playEpisode = String\(index\)/);
  assert.doesNotMatch(app, /CHAOS_SERIES_DESCRIPTION/);
  assert.match(app, /scripts: \[\]/);
  assert.match(app, /Script chapter marks/);
  assert.match(app, /Select a script to jump straight to the moment it begins/);
  assert.match(app, /dataset\.startSeconds/);
  assert.doesNotMatch(app, /resourceUrl|resourceLabel|episode-script-resource/);
  assert.match(app, /buttonLabel\.textContent = presentation\.name/);
  assert.match(app, /timestamp\.append\(playMark, buttonLabel\)/);
  assert.doesNotMatch(app, /timestamp\.textContent = `Watch from/);
  assert.match(app, /function episodeScriptPresentation/);
  assert.match(app, /function episodeScriptTagTone/);
  assert.match(app, /function episodeFormatSummary/);
  assert.equal((app.match(/description: "/g) || []).length, 16);
  assert.match(app, /Inside this episode/);
  assert.match(app, /where the town get to pick their own characters with chaotic results/);
  assert.match(app, /a familiar red mining ship in deep space/);
  assert.match(app, /send the group back to Red Dwarf and an epic quest for ultimate power/);
  assert.match(app, /parentheticalTags\.unshift/);
  assert.equal((app.match(/startSeconds: \d+/g) || []).length, 46);
  assert.match(app, /name: "Catfishing", startSeconds: 297/);
  assert.match(app, /name: "Kaboom! \(Multiple Games\)", startSeconds: 5176/);
  assert.match(app, /name: "Trouble Brewing \(Base 3\)", startSeconds: 60/);
  assert.match(app, /name: "Whale Buffet \(Special Game Mode\)", startSeconds: 5045/);
  assert.match(app, /name: "Trouble in Whoville", startSeconds: 50/);
  assert.match(app, /name: "Somebody Had To Do It", startSeconds: 5704/);
  assert.match(app, /name: "Hear No Evil, See No Evil, Speak No Evil", startSeconds: 8995/);
  assert.match(app, /name: "Nobody Fucking Move \(Several Games\) \(Teensy\)", startSeconds: 660/);
  assert.match(app, /name: "Sleepin With The Fishes \(Full Homebrew\)", startSeconds: 4005/);
  assert.match(app, /name: "Blind Man’s Bluff \(Veiled Game\)", startSeconds: 8981/);
  assert.match(app, /name: "One To Rule Them All \(Full Homebrew\)", startSeconds: 8625/);
  assert.match(app, /name: "A Teensy Moon Rising \(Teensy\)", startSeconds: 7308/);
  assert.match(app, /formatEpisodeTime/);
  assert.match(app, /card\.classList\.toggle\("is-active", active\)/);
  assert.match(html, /data-action="watch"/);
  assert.match(app, /searchParams\.set\("watch", "1"\)/);
  assert.match(css, /\.episode-player-frame/);
  assert.match(css, /\.episode-card\.is-active/);
  assert.match(css, /\.episode-dossier-art/);
  assert.match(css, /\.episode-dossier-body/);
  assert.match(css, /\.episode-dossier-body h3 \{ max-width: calc\(100% - 5\.35rem\).*overflow-wrap: normal; word-break: normal/);
  assert.match(css, /\.episode-dossier-body h3 \{ max-width: 100%; margin-top: 2\.9rem; \}/);
  assert.match(app, /dataset\.episodeNumber = String\(episode\.number\)/);
  assert.match(css, /content: attr\(data-episode-number\)/);
  assert.match(app, /label\.textContent = `Episode \$\{episode\.number\}`/);
  assert.doesNotMatch(app, /Case file · Episode/);
  assert.doesNotMatch(css, /content: "EP"/);
  assert.match(css, /assets\/episode-wax-seal\.png/);
  assert.match(css, /-webkit-text-stroke:/);
  assert.deepEqual([...episodeWaxSeal.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(css, /\.episode-scripts/);
  assert.match(css, /\.episode-timestamp/);
  assert.match(css, /\.episode-script-tag--game-count/);
  assert.match(css, /\.episode-script-tag--base-three/);
  assert.match(css, /\.episode-script-tag--special-mode/);
  assert.match(css, /\.episode-script-tag--teensy/);
  assert.match(css, /\.episode-script-tag--homebrew/);
  assert.match(css, /\.episode-script-tag--veiled/);
  assert.match(css, /\.episode-script-tag--smarty/);
  assert.doesNotMatch(css, /\.episode-script-resource/);
  assert.match(html, /class="archive-link"/);
  assert.match(html, /class="archive-sigil"/);
  assert.doesNotMatch(html, /class="youtube-link"/);
  assert.match(css, /\.archive-sigil::before/);
});

test("wide headers use spare space for official game resources", () => {
  assert.match(html, /class="header-resources"/);
  assert.match(html, /https:\/\/wiki\.bloodontheclocktower\.com\/Main_Page/);
  assert.match(html, /https:\/\/botc\.app\//);
  assert.match(html, /assets\/official-botc-logo\.png/);
  assert.match(html, /assets\/official-app-puck\.png/);
  assert.deepEqual([...officialBotcLogo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...officialAppPuck.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(css, /@media \(min-width: 1120px\)/);
  assert.match(css, /\.header-resources \{ display: flex; \}/);
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
  assert.match(html, /Base or beginner-friendly custom scripts/);
  assert.match(app, /Official base scripts or carefully selected beginner-friendly custom scripts/);
  assert.match(app, /class="difficulty-description"/);
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
