export const EXPERIENCE_LEVELS = ["Beginner", "Experienced", "Expert"];
export const RESPONSES = ["available", "maybe", "unavailable"];
export const SCRIPT_TEAMS = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric", "unknown"];

const TEAM_ALIASES = {
  townsfolk: "townsfolk", outsider: "outsider", outsiders: "outsider",
  minion: "minion", minions: "minion", demon: "demon", demons: "demon",
  traveler: "traveller", traveller: "traveller", fabled: "fabled", loric: "loric"
};

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeScriptTeam(value) {
  return TEAM_ALIASES[String(value || "").toLowerCase()] || "unknown";
}

function officialIconUrl(reference, id) {
  const edition = String(reference.edition || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!edition || !id) return "";
  const team = normalizeScriptTeam(reference.team);
  const alignment = ["townsfolk", "outsider"].includes(team) ? "_g" : ["minion", "demon"].includes(team) ? "_e" : "";
  return `https://release.botc.app/resources/characters/${encodeURIComponent(edition)}/${encodeURIComponent(id)}${alignment}.webp`;
}

export function parseScriptJson(raw, catalogue = []) {
  let source;
  try { source = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { throw new Error("That file is not valid JSON."); }
  if (!Array.isArray(source)) throw new Error("A BOTC script JSON must contain a list of characters.");

  const known = new Map(catalogue.map(character => [String(character.id || "").toLowerCase(), character]));
  const meta = source.find(item => item && typeof item === "object" && item.id === "_meta") || {};
  const characters = source.filter(item => item !== meta && (typeof item === "string" || (item && typeof item === "object" && item.id !== "_meta"))).slice(0, 80).map(item => {
    const id = cleanText(typeof item === "string" ? item : item.id, 80).toLowerCase();
    const supplied = typeof item === "object" ? item : {};
    const reference = known.get(id) || {};
    const fallbackName = id.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
    const catalogueIcon = reference.id && reference._officialAsset === true ? officialIconUrl(reference, id) : "";
    const suppliedTeam = normalizeScriptTeam(supplied.team);
    return {
      id,
      name: cleanText(supplied.name || reference.name || fallbackName || "Unknown character", 80),
      team: suppliedTeam === "unknown" ? normalizeScriptTeam(reference.team) : suppliedTeam,
      ability: cleanText(supplied.ability || reference.ability, 500),
      iconUrl: catalogueIcon
    };
  }).filter(character => character.id || character.name);

  if (!characters.length) throw new Error("That script does not contain any characters.");
  return {
    name: cleanText(meta.name, 100),
    author: cleanText(meta.author, 80),
    characters
  };
}

export function dateIndicator(available) {
  if (available >= 7) return { label: "Full Town game possible", tone: "full" };
  if (available >= 5) return { label: "Teensyville possible", tone: "teensy" };
  return { label: "Not enough players yet", tone: "waiting" };
}

export function gameSize(count) {
  if (count >= 7) return "Full Town Game";
  if (count >= 5) return "Teensyville Game";
  return "Gathering players";
}

export function normalizeSessionCode(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.searchParams.get("session") || "";
  } catch {
    return text.replace(/[^A-Za-z0-9_-]/g, "");
  }
}

export function normalizeInviteSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function inviteSlugError(value) {
  if (!value || value.length < 4) return "Use at least 4 letters or numbers for the custom player link.";
  if (value.length > 48) return "Keep the custom player link to 48 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return "Use lowercase letters, numbers and single hyphens only.";
  return "";
}

export function buildDateOptions(values) {
  return values.filter(Boolean).slice(0, 10).map((startAt, index) => ({ id: `option-${index + 1}`, startAt }));
}

export function buildRecurringDates(startAt, interval, count) {
  const match = String(startAt || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Choose the first date and time for the series.");
  if (!["daily", "weekly", "monthly"].includes(interval)) throw new Error("Choose daily, weekly or monthly repeats.");
  const total = Number(count);
  if (!Number.isInteger(total) || total < 2 || total > 10) throw new Error("Generate between 2 and 10 date options.");
  const [, year, month, day, hour, minute] = match.map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (anchor.getUTCFullYear() !== year || anchor.getUTCMonth() !== month - 1 || anchor.getUTCDate() !== day) throw new Error("Choose a valid first date and time.");
  const pad = value => String(value).padStart(2, "0");
  return Array.from({ length: total }, (_, index) => {
    let date;
    if (interval === "monthly") {
      const monthStart = new Date(Date.UTC(year, month - 1 + index, 1, hour, minute));
      const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
      date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(day, lastDay), hour, minute));
    } else {
      date = new Date(anchor);
      date.setUTCDate(date.getUTCDate() + index * (interval === "weekly" ? 7 : 1));
    }
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  });
}

export function promotedStatus(response) {
  if (response === "available") return "confirmed";
  if (response === "maybe") return "maybe";
  return null;
}

export function validatePlayer(input) {
  const displayName = String(input.displayName || "").trim();
  if (displayName.length < 2 || displayName.length > 40) throw new Error("Enter a name between 2 and 40 characters.");
  if (!EXPERIENCE_LEVELS.includes(input.experience)) throw new Error("Choose your experience level.");
  return { displayName, experience: input.experience };
}
