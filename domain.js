export const EXPERIENCE_LEVELS = ["Beginner", "Experienced", "Expert"];
export const RESPONSES = ["available", "maybe", "unavailable"];

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
