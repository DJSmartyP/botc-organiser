import test from "node:test";
import assert from "node:assert/strict";
import { buildDateOptions, buildRecurringDates, dateIndicator, gameSize, inviteSlugError, normalizeInviteSlug, normalizeSessionCode, parseScriptJson, promotedStatus, validatePlayer } from "../domain.js";

test("date thresholds exclude maybe responses", () => {
  assert.equal(dateIndicator(4).label, "Not enough players yet");
  assert.equal(dateIndicator(5).label, "Teensyville possible");
  assert.equal(dateIndicator(6).label, "Teensyville possible");
  assert.equal(dateIndicator(7).label, "Full Town game possible");
});

test("registered player thresholds match the game formats", () => {
  assert.equal(gameSize(4), "Gathering players");
  assert.equal(gameSize(5), "Teensyville Game");
  assert.equal(gameSize(6), "Teensyville Game");
  assert.equal(gameSize(7), "Full Town Game");
});

test("session codes can be pasted as codes or links", () => {
  assert.equal(normalizeSessionCode("abc_123"), "abc_123");
  assert.equal(normalizeSessionCode("https://example.com/?session=night-7"), "night-7");
});

test("custom player links follow the IDP slug format", () => {
  assert.equal(normalizeInviteSlug(" Friday Night: Trouble Brewing! "), "friday-night-trouble-brewing");
  assert.equal(inviteSlugError("fri"), "Use at least 4 letters or numbers for the custom player link.");
  assert.equal(inviteSlugError("friday-night"), "");
});

test("date options are capped at ten and given stable ids", () => {
  const values = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}T19:00`);
  const result = buildDateOptions(values);
  assert.equal(result.length, 10);
  assert.equal(result[0].id, "option-1");
  assert.equal(result[9].id, "option-10");
});

test("daily, weekly and monthly date series preserve the chosen local time", () => {
  assert.deepEqual(buildRecurringDates("2026-09-12T19:30", "daily", 3), ["2026-09-12T19:30", "2026-09-13T19:30", "2026-09-14T19:30"]);
  assert.deepEqual(buildRecurringDates("2026-09-12T19:30", "weekly", 3), ["2026-09-12T19:30", "2026-09-19T19:30", "2026-09-26T19:30"]);
  assert.deepEqual(buildRecurringDates("2027-01-31T19:30", "monthly", 4), ["2027-01-31T19:30", "2027-02-28T19:30", "2027-03-31T19:30", "2027-04-30T19:30"]);
  assert.throws(() => buildRecurringDates("", "weekly", 3), /first date/);
  assert.throws(() => buildRecurringDates("2026-09-12T19:30", "weekly", 11), /between 2 and 10/);
});

test("final-date promotion preserves available and maybe states", () => {
  assert.equal(promotedStatus("available"), "confirmed");
  assert.equal(promotedStatus("maybe"), "maybe");
  assert.equal(promotedStatus("unavailable"), null);
});

test("player details are constrained to public-safe fields", () => {
  assert.deepEqual(validatePlayer({ displayName: "  Rowan  ", experience: "Fresh Blood" }), { displayName: "Rowan", experience: "Fresh Blood" });
  assert.deepEqual(validatePlayer({ displayName: "Morgan", experience: "Criminal Mastermind" }), { displayName: "Morgan", experience: "Criminal Mastermind" });
  assert.deepEqual(validatePlayer({ displayName: "Legacy Player", experience: "Experienced" }), { displayName: "Legacy Player", experience: "Experienced" });
  assert.throws(() => validatePlayer({ displayName: "R", experience: "Expert" }));
  assert.throws(() => validatePlayer({ displayName: "Rowan", experience: "Legend" }));
});

test("BOTC script JSON resolves standard character ids and metadata", () => {
  const parsed = parseScriptJson(JSON.stringify([{ id: "_meta", name: "Test Script", author: "Chaos" }, "washerwoman", "poisoner"]), [
    { id: "washerwoman", name: "Washerwoman", team: "townsfolk", ability: "Learn that one of two players is a Townsfolk." },
    { id: "poisoner", name: "Poisoner", team: "minion", ability: "Choose a player each night." }
  ]);
  assert.equal(parsed.name, "Test Script");
  assert.equal(parsed.characters[0].team, "townsfolk");
  assert.equal(parsed.characters[1].team, "minion");
});

test("official role references place newer and previously unresolved characters in the right teams", () => {
  const parsed = parseScriptJson([{ id: "alsaahir", name: "Alsaahir", team: "unknown", ability: "", iconUrl: "" }, "hermit", "wizard", "gnome", "duchess"], [
    { id: "alsaahir", name: "Alsaahir", team: "townsfolk", edition: "carousel", _officialAsset: true },
    { id: "hermit", name: "Hermit", team: "outsider", edition: "carousel", _officialAsset: true },
    { id: "wizard", name: "Wizard", team: "minion", edition: "carousel", _officialAsset: true },
    { id: "gnome", name: "Gnome", team: "traveller", edition: "carousel", _officialAsset: true },
    { id: "duchess", name: "Duchess", team: "fabled", edition: "fabled", ability: "Each day, 3 players may choose to visit you.", _officialAsset: true }
  ]);
  assert.deepEqual(parsed.characters.map(character => character.team), ["townsfolk", "outsider", "minion", "traveller", "fabled"]);
  assert.equal(parsed.characters[0].iconUrl, "https://release.botc.app/resources/characters/carousel/alsaahir_g.webp");
  assert.equal(parsed.characters[2].iconUrl, "https://release.botc.app/resources/characters/carousel/wizard_e.webp");
  assert.equal(parsed.characters[3].iconUrl, "https://release.botc.app/resources/characters/carousel/gnome.webp");
  assert.equal(parsed.characters[4].iconUrl, "https://release.botc.app/resources/characters/fabled/duchess.webp");
  assert.equal(parsed.characters[4].ability, "Each day, 3 players may choose to visit you.");
});

test("BOTC script JSON ignores custom artwork and uses initials for homebrew", () => {
  const parsed = parseScriptJson([{ id: "custom-demon", name: "Night Beast", team: "demons", ability: "Each night, choose a player.", image: ["http://unsafe.example/token.png", "https://github.com/clockmaker/homebrew/blob/main/tokens/night-beast.png"] }]);
  assert.equal(parsed.characters[0].team, "demon");
  assert.equal(parsed.characters[0].iconUrl, "");
  assert.throws(() => parseScriptJson("not json"), /valid JSON/);
  assert.throws(() => parseScriptJson({}), /list of characters/);
});
