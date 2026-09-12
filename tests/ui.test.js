import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8")
]);

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
  assert.match(html, /New players warmly welcomed/);
  assert.match(app, /function renderDifficultyBadge/);
  assert.match(app, /id="sessionDifficulty"/);
  assert.match(app, /updateSessionDifficulty/);
  assert.match(css, /\.difficulty-picker/);
  assert.match(css, /\.difficulty-badge/);
});
