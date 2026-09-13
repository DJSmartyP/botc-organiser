import { firebaseConfig } from "./firebase-config.js";
import { buildDateOptions, buildRecurringDates, dateIndicator, gameSize, inviteSlugError, normalizeInviteSlug, normalizeSessionCode, parseScriptJson, promotedStatus, validatePlayer } from "./domain.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const views = $$(".view");
const localDemo = ["localhost", "127.0.0.1"].includes(location.hostname) && new URL(location.href).searchParams.get("demo") === "1";
const demoMode = localDemo || firebaseConfig.apiKey === "REPLACE_ME" || firebaseConfig.projectId === "YOUR_PROJECT_ID";
let firebase = null;
let currentUser = null;
let currentProfile = null;
let createMode = "fixed";
let activeSession = null;
let demoSessions = [];
let demoManager = false;
let dashboardSessions = [];
let dashboardOrganizers = [];
let dashboardMode = "sessions";
let dashboardVisibleLimit = 25;
let characterCataloguePromise = null;
const demoPlayerUid = "demo-player";

const BUILT_IN_SCRIPTS = {
  tb: { name: "Trouble Brewing", logo: "assets/script-tb.webp" },
  bmr: { name: "Bad Moon Rising", logo: "assets/script-bmr.webp" },
  snv: { name: "Sects & Violets", logo: "assets/script-snv.webp" }
};

const CHAOS_PLAYLIST_ID = "PLpw9gMGspkwSc155CHY0HjyAq5_BYGGra";
const CHAOS_EPISODES = [
  { number: 16, videoId: "6cLpnO2VfAA", title: "Back To Basics..." },
  { number: 15, videoId: "FMkcNCn9YTk", title: "More Muppet Madness..." },
  { number: 14, videoId: "Oiqgyiskbe8", title: "Chaos, Assemble..." },
  { number: 13, videoId: "TMPYR60R4P0", title: "The Case For Cannibalism..." },
  { number: 12, videoId: "Dpf0T0v7uPI", title: "Nobody F****** Move..." },
  { number: 11, videoId: "00EaJpX2Tpg", title: "Whale Buffet 2 — More Whale..." },
  { number: 10, videoId: "bLzod4_0okM", title: "Just A Po Girl, Living In A Po World..." },
  { number: 9, videoId: "kBd3Rtc6mpM", title: "Waka, Waka, Waka!" },
  { number: 8, videoId: "zZfY3mDNMzQ", title: "It's Cold Outside..." },
  { number: 7, videoId: "Yi1ZkK774QM", title: "Veiled But Vicious" },
  { number: 6, videoId: "pof-V0Vs334", title: "No ED...But We Do Have Ringworm..." },
  { number: 5, videoId: "s6dfwXIgJfQ", title: "Devious Damsels and Covert Cults" },
  { number: 4, videoId: "rlUBo8nGEIU", title: "Teensyville Turmoil and Trouble" },
  { number: 3, videoId: "_EVyWJP2fTo", title: "Stuck in Hermit Havoc" },
  { number: 2, videoId: "G4DUPryv8Aw", title: "The First Whale Buffet" },
  { number: 1, videoId: "5w-Ry7TrzvA", title: "The Fastest Game" }
].map(episode => ({ scripts: [], ...episode }));

function formatEpisodeTime(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderEpisodePicker() {
  const list = $("#episodeList");
  if (!list) return;
  list.replaceChildren(...CHAOS_EPISODES.map((episode, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "episode-card";
    button.dataset.episodeIndex = String(index);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `View Episode ${episode.number}: ${episode.title}`);
    const image = document.createElement("img");
    image.src = `assets/episodes/${episode.videoId}.jpg`;
    image.alt = "";
    image.loading = "lazy";
    image.width = 320;
    image.height = 180;
    const copy = document.createElement("span");
    copy.className = "episode-card-copy";
    const number = document.createElement("small");
    number.textContent = `Episode ${episode.number}`;
    const title = document.createElement("strong");
    title.textContent = episode.title;
    copy.append(number, title);
    const play = document.createElement("span");
    play.className = "episode-card-play";
    play.setAttribute("aria-hidden", "true");
    button.append(image, copy, play);
    return button;
  }));
}

function setActiveEpisode(index) {
  $$(".episode-card").forEach((card, cardIndex) => {
    const active = cardIndex === index;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-pressed", String(active));
  });
}

function showEpisodeDetails(index = 0, focusPlay = false) {
  const episode = CHAOS_EPISODES[index] || CHAOS_EPISODES[0];
  const frame = $("#episodeStage");
  if (!frame) return;
  frame.classList.add("has-dossier");
  frame.classList.remove("is-playing");
  const dossier = document.createElement("article");
  dossier.className = "episode-dossier";
  const artwork = document.createElement("img");
  artwork.className = "episode-dossier-art";
  artwork.src = `assets/episodes/${episode.videoId}.jpg`;
  artwork.alt = `Episode ${episode.number}: ${episode.title}`;
  artwork.width = 320;
  artwork.height = 180;
  const body = document.createElement("div");
  body.className = "episode-dossier-body";
  const label = document.createElement("span");
  label.className = "eyebrow";
  label.textContent = `Case file · Episode ${episode.number}`;
  const title = document.createElement("h3");
  title.textContent = episode.title;
  const scriptPanel = document.createElement("section");
  scriptPanel.className = "episode-scripts";
  const scriptHeading = document.createElement("h4");
  scriptHeading.textContent = "Scripts this episode";
  scriptPanel.append(scriptHeading);
  if (episode.scripts.length) {
    const scriptList = document.createElement("ul");
    episode.scripts.forEach(script => {
      const item = document.createElement("li");
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = script.name;
      copy.append(name);
      if (script.notes) {
        const notes = document.createElement("small");
        notes.textContent = script.notes;
        copy.append(notes);
      }
      item.append(copy);
      if (Number.isFinite(script.startSeconds)) {
        const timestamp = document.createElement("button");
        timestamp.type = "button";
        timestamp.className = "episode-timestamp";
        timestamp.dataset.playEpisode = String(index);
        timestamp.dataset.startSeconds = String(script.startSeconds);
        timestamp.textContent = `Play from ${formatEpisodeTime(script.startSeconds)}`;
        timestamp.setAttribute("aria-label", `Play ${script.name} from ${formatEpisodeTime(script.startSeconds)}`);
        item.append(timestamp);
      }
      scriptList.append(item);
    });
    scriptPanel.append(scriptList);
  } else {
    const pending = document.createElement("p");
    pending.className = "episode-scripts-pending";
    pending.textContent = "Script details coming soon.";
    scriptPanel.append(pending);
  }
  const play = document.createElement("button");
  play.type = "button";
  play.className = "button button-primary episode-dossier-play";
  play.dataset.playEpisode = String(index);
  play.innerHTML = '<span class="dossier-play-mark" aria-hidden="true"></span><span>Play episode</span>';
  body.append(label, title, scriptPanel, play);
  dossier.append(artwork, body);
  frame.replaceChildren(dossier);
  setActiveEpisode(index);
  const status = $("#episodeNowPlaying");
  if (status) status.textContent = `Selected · Episode ${episode.number} · Press Play episode to begin.`;
  if (focusPlay) play.focus({ preventScroll: true });
}

function loadEpisode(index = 0, startSeconds = 0) {
  const episode = CHAOS_EPISODES[index] || CHAOS_EPISODES[0];
  const frame = $("#episodeStage");
  if (!frame) return;
  frame.classList.remove("has-dossier");
  frame.classList.add("is-playing");
  const iframe = document.createElement("iframe");
  const start = Math.max(0, Number(startSeconds) || 0);
  iframe.src = `https://www.youtube-nocookie.com/embed/${episode.videoId}?list=${CHAOS_PLAYLIST_ID}&index=${CHAOS_EPISODES.length - episode.number + 1}&autoplay=1&rel=0${start ? `&start=${Math.floor(start)}` : ""}`;
  iframe.title = `Chaos on the Clocktower — Episode ${episode.number}: ${episode.title}`;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  frame.replaceChildren(iframe);
  setActiveEpisode(index);
  const status = $("#episodeNowPlaying");
  if (status) status.textContent = `Now playing · Episode ${episode.number} · ${episode.title}`;
  iframe.focus();
}

const sampleSession = {
  id: "sample-night",
  ownerUid: "demo-organiser",
  organizerName: "The Storyteller",
  storytellerNames: "The Storyteller, A Helpful Imp",
  title: "A night in Ravenswood Bluff",
  location: "The Old Bell, upstairs room",
  timezone: "Europe/London",
  notes: "Arrive from 6:30pm. The first game begins at 7pm.",
  status: "date_poll",
  visibility: "public",
  capacity: 15,
  difficulty: "Beginner",
  scriptMode: "chosen",
  scriptName: "Trouble Brewing",
  scriptUrl: "",
  scriptData: {
    name: "Trouble Brewing", author: "The Pandemonium Institute", characters: [
      { id: "washerwoman", name: "Washerwoman", team: "townsfolk", ability: "You start knowing that 1 of 2 players is a particular Townsfolk.", iconUrl: "https://release.botc.app/resources/characters/tb/washerwoman_g.webp" },
      { id: "recluse", name: "Recluse", team: "outsider", ability: "You might register as evil and as a Minion or Demon, even if dead.", iconUrl: "https://release.botc.app/resources/characters/tb/recluse_g.webp" },
      { id: "poisoner", name: "Poisoner", team: "minion", ability: "Each night, choose a player: they are poisoned tonight and tomorrow day.", iconUrl: "https://release.botc.app/resources/characters/tb/poisoner_e.webp" },
      { id: "imp", name: "Imp", team: "demon", ability: "Each night, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.", iconUrl: "https://release.botc.app/resources/characters/tb/imp_e.webp" }
    ]
  },
  scripts: [],
  inviteSlug: "ravenswood-night",
  dateOptions: [
    { id: "option-1", startAt: futureLocal(5, 19) },
    { id: "option-2", startAt: futureLocal(12, 19) },
    { id: "option-3", startAt: futureLocal(19, 18, 30) }
  ],
  counts: {
    "option-1": { available: 6, maybe: 2, unavailable: 1 },
    "option-2": { available: 8, maybe: 1, unavailable: 0 },
    "option-3": { available: 4, maybe: 3, unavailable: 2 }
  },
  roster: [],
  registrations: []
};

sampleSession.scripts = [
  { id: "trouble-brewing", name: "Trouble Brewing", author: "The Pandemonium Institute", edition: "tb", sourceType: "json", pdfUrl: "", preferred: true, order: 0, scriptData: sampleSession.scriptData },
  { id: "bad-moon-rising", name: "Bad Moon Rising", author: "The Pandemonium Institute", edition: "bmr", sourceType: "json", pdfUrl: "", preferred: false, order: 1, scriptData: { name: "Bad Moon Rising", author: "The Pandemonium Institute", characters: [
    { id: "grandmother", name: "Grandmother", team: "townsfolk", ability: "You start knowing a good player and their character. If the Demon kills them, you die too.", iconUrl: "https://release.botc.app/resources/characters/bmr/grandmother_g.webp" },
    { id: "lunatic", name: "Lunatic", team: "outsider", ability: "You think you are a Demon, but you are not. The Demon knows who you are and who you choose at night.", iconUrl: "https://release.botc.app/resources/characters/bmr/lunatic_g.webp" },
    { id: "devilsadvocate", name: "Devil's Advocate", team: "minion", ability: "Each night, choose a living player. If executed tomorrow, they do not die.", iconUrl: "https://release.botc.app/resources/characters/bmr/devilsadvocate_e.webp" },
    { id: "shabaloth", name: "Shabaloth", team: "demon", ability: "Each night, choose 2 players: they die. A dead player you chose last night might be regurgitated.", iconUrl: "https://release.botc.app/resources/characters/bmr/shabaloth_e.webp" }
  ] } }
];

function futureLocal(days, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString().slice(0, 16);
}

async function initialiseFirebase() {
  if (demoMode) {
    demoSessions = [structuredClone(sampleSession)];
    $("#demoSessionButton").hidden = false;
    $("#dashboardNotice").textContent = "Preview mode: add your Firebase configuration to enable secure, shared data.";
    return;
  }
  const appSdk = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js");
  const authSdk = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js");
  const dbSdk = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
  const app = appSdk.initializeApp(firebaseConfig);
  firebase = { ...authSdk, ...dbSdk, auth: authSdk.getAuth(app), db: dbSdk.getFirestore(app) };
  authSdk.onAuthStateChanged(firebase.auth, async user => {
    currentUser = user;
    currentProfile = null;
    if (user && !user.isAnonymous) {
      const snap = await dbSdk.getDoc(dbSdk.doc(firebase.db, "users", user.uid));
      currentProfile = snap.exists() ? snap.data() : { displayName: user.displayName || user.email.split("@")[0], role: "organizer" };
      const token = await user.getIdTokenResult();
      if (token.claims.admin === true) currentProfile = { ...currentProfile, role: "admin" };
    }
    updateAccountUi();
    if (!$("#dashboardView").hidden) renderDashboard();
  });
}

function showView(id) {
  views.forEach(view => { view.hidden = view.id !== id; });
  if (id !== "sessionView") $(".header-actions").hidden = false;
  window.scrollTo({ top: 0, behavior: "instant" });
  $("#app").focus({ preventScroll: true });
}

function updateAccountUi() {
  const signedIn = currentUser && !currentUser.isAnonymous;
  $("#dashboardButton").textContent = signedIn ? "Dashboard" : "Google sign in";
  $("#startOrganisingButton").textContent = signedIn ? "Open organiser portal" : "Continue with Google";
  $("#startOrganisingButton").classList.toggle("button-primary", !signedIn);
  $("#startOrganisingButton").classList.toggle("button-secondary", signedIn);
  $("#signOutButton").hidden = !signedIn;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function safeExternalUrl(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
}

function officialTokenUrl(value) {
  const candidate = safeExternalUrl(value);
  if (!candidate) return "";
  const url = new URL(candidate);
  return url.hostname === "release.botc.app" && url.pathname.startsWith("/resources/characters/") ? url.href : "";
}

async function loadCharacterCatalogue() {
  characterCataloguePromise ||= Promise.all([
    fetch("assets/official-roles.json?v=1").then(response => response.ok ? response.json() : fetch("https://release.botc.app/resources/data/roles.json").then(fallback => fallback.ok ? fallback.json() : [])).catch(() => []),
    fetch("https://raw.githubusercontent.com/bra1n/townsquare/develop/src/roles.json").then(response => response.ok ? response.json() : []).catch(() => [])
  ]).then(([official, community]) => {
    const roles = new Map();
    community.forEach(role => roles.set(String(role.id || "").toLowerCase(), { ...role, _officialAsset: false }));
    official.forEach(role => roles.set(String(role.id || "").toLowerCase(), { ...role, _officialAsset: true }));
    return [...roles.values()];
  });
  return characterCataloguePromise;
}

async function builtInScriptData(edition) {
  const definition = BUILT_IN_SCRIPTS[edition];
  if (!definition) throw new Error("Choose a built-in script or upload a JSON file.");
  const catalogue = await loadCharacterCatalogue();
  const ids = catalogue.filter(role => role._officialAsset === true && role.edition === edition && ["townsfolk", "outsider", "minion", "demon"].includes(role.team)).map(role => role.id);
  if (!ids.length) throw new Error("The built-in script catalogue could not be loaded. Try again online.");
  return parseScriptJson([{ id: "_meta", name: definition.name, author: "The Pandemonium Institute" }, ...ids], catalogue);
}

async function scriptFromChoice(choice, file) {
  if (BUILT_IN_SCRIPTS[choice]) {
    const scriptData = await builtInScriptData(choice);
    return { name: BUILT_IN_SCRIPTS[choice].name, author: scriptData.author, edition: choice, sourceType: "json", pdfUrl: "", scriptData };
  }
  if (choice !== "upload" || !file?.size) throw new Error("Choose a built-in script or a BOTC script JSON file.");
  const scriptData = await readScriptFile(file);
  return { name: scriptData.name || file.name.replace(/\.json$/i, "").replace(/[-_]+/g, " ").trim() || "Uploaded script", author: scriptData.author || "", edition: "", sourceType: "json", pdfUrl: "", scriptData };
}

function storytellerNames(session) {
  return String(session?.storytellerNames || session?.organizerName || "Organiser").trim();
}

function normalizeStorytellerNames(value) {
  const names = String(value || "").split(",").map(name => name.trim()).filter(Boolean);
  const result = names.join(", ").slice(0, 160);
  if (result.length < 2) throw new Error("Enter at least one Storyteller name.");
  return result;
}

async function readScriptFile(file) {
  if (!file) return null;
  if (file.size > 250000) throw new Error("Keep the script JSON under 250 KB.");
  return parseScriptJson(await file.text(), await loadCharacterCatalogue());
}

function validTimezone(value) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; }
  catch { return ""; }
}

function sessionTimezone(session) {
  return validTimezone(session?.timezone) || validTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "Europe/London";
}

function zonedDate(value, timeZone = "") {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match || !validTimezone(timeZone)) return new Date(value);
  const target = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let pass = 0; pass < 2; pass++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess -= represented - target;
  }
  return new Date(guess);
}

function formatDate(value, timeZone = "") {
  const date = zonedDate(value, timeZone);
  const zone = validTimezone(timeZone);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", ...(zone ? { timeZone: zone, timeZoneName: "short" } : {}) }).format(date);
}

function toDateTimeLocal(value, timeZone = "") {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 16);
  const date = value?.toDate ? value.toDate() : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: validTimezone(timeZone) || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function toDateValue(value) {
  return value?.toDate ? value.toDate().toISOString() : value;
}

const commonTimezones = ["Europe/London", "Europe/Dublin", "UTC", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney"];

function populateTimezoneSelect(select, selected = "") {
  if (!select) return;
  const detected = validTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const zones = [...new Set([selected, detected, ...commonTimezones].filter(validTimezone))];
  select.innerHTML = zones.map(zone => `<option value="${escapeHtml(zone)}"${zone === (selected || detected || "Europe/London") ? " selected" : ""}>${escapeHtml(zone.replaceAll("_", " "))}</option>`).join("");
}

function escapeCalendar(value = "") {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function calendarStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function downloadCalendar(session) {
  const value = session.selectedDate || session.fixedDate;
  if (!value) return;
  const start = zonedDate(value, sessionTimezone(session));
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const contents = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Chaos Planner//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${session.id}@chaos-planner`, `DTSTAMP:${calendarStamp(new Date())}`, `DTSTART:${calendarStamp(start)}`, `DTEND:${calendarStamp(end)}`, `SUMMARY:${escapeCalendar(session.title)}`, `LOCATION:${escapeCalendar(session.location)}`, `DESCRIPTION:${escapeCalendar(session.notes || "")}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([contents], { type: "text/calendar;charset=utf-8" }));
  link.download = `${normalizeInviteSlug(session.title) || "chaos-planner-event"}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function buildSessionLink(id, inviteSlug = "") {
  return `${location.origin}${location.pathname}?${inviteSlug ? `join=${encodeURIComponent(inviteSlug)}` : `session=${encodeURIComponent(id)}`}`;
}

async function resolveInvite(slug) {
  const normalized = normalizeInviteSlug(slug);
  if (inviteSlugError(normalized) || normalized !== slug) throw new Error("That custom player link is not valid.");
  if (demoMode) {
    const match = demoSessions.find(session => session.inviteSlug === normalized);
    if (!match) throw new Error("That custom player link does not exist.");
    return match.id;
  }
  await ensurePlayerUser();
  const snap = await firebase.getDoc(firebase.doc(firebase.db, "inviteLinks", normalized));
  if (!snap.exists() || !snap.data().sessionId) throw new Error("That custom player link does not exist.");
  return snap.data().sessionId;
}

async function openInvite(slug) {
  showView("sessionView");
  $("#sessionContent").innerHTML = '<div class="loading">Following the player link…</div>';
  try {
    const normalized = normalizeInviteSlug(slug);
    const requestedScript = new URL(location.href).searchParams.get("script");
    const url = new URL(location.href); url.search = ""; if (localDemo) url.searchParams.set("demo", "1"); url.searchParams.set("join", normalized); if (requestedScript) url.searchParams.set("script", requestedScript); history.replaceState({}, "", url);
    await openSession(await resolveInvite(normalized), true);
  }
  catch (error) { $("#sessionContent").innerHTML = `<div class="panel error-panel"><h1>Link not found</h1><p>${escapeHtml(error.message)}</p></div>`; }
}

async function openDashboard() {
  if (!demoMode && (!currentUser || currentUser.isAnonymous)) {
    await signInWithGoogle();
    return;
  }
  if (demoMode) demoManager = true;
  showView("dashboardView");
  await renderDashboard();
}

async function signInWithGoogle() {
  const errorBox = $("#authError"); errorBox.hidden = true;
  try {
    const provider = new firebase.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await firebase.signInWithPopup(firebase.auth, provider);
    const userRef = firebase.doc(firebase.db, "users", result.user.uid);
    const existing = await firebase.getDoc(userRef);
    if (!existing.exists()) {
      await firebase.setDoc(userRef, {
        displayName: (result.user.displayName || "Organiser").slice(0, 60),
        email: (result.user.email || "").toLowerCase(),
        role: "organizer",
        createdAt: firebase.serverTimestamp()
      });
    }
    currentUser = result.user;
    const token = await result.user.getIdTokenResult();
    currentProfile = existing.exists() ? existing.data() : { displayName: result.user.displayName || "Organiser", role: "organizer" };
    if (token.claims.admin === true) currentProfile.role = "admin";
    updateAccountUi();
    await openDashboard();
  } catch (error) {
    errorBox.textContent = error.code === "auth/popup-closed-by-user" ? "Google sign-in was cancelled." : "Google sign-in could not be completed. Please try again.";
    errorBox.hidden = false;
  }
}

async function renderDashboard() {
  const list = $("#sessionList");
  list.innerHTML = '<div class="loading">Consulting the grimoire…</div>';
  let sessions = [];
  if (demoMode) {
    sessions = demoSessions.map(session => ({ ...session, registeredCount: (session.registrations || []).length }));
    dashboardOrganizers = [{ id: "demo-organiser", displayName: "Demo Organiser", email: "demo@example.com", role: "organizer" }];
    $("#dashboardNotice").hidden = false;
  } else if (currentUser && !currentUser.isAnonymous) {
    const { collection, getDocs, query, where } = firebase;
    const base = collection(firebase.db, "sessions");
    const q = currentProfile?.role === "admin" ? query(base, where("visibility", "==", "public")) : query(base, where("ownerUid", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    sessions = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    await Promise.all(sessions.map(async session => {
      try {
        const count = await firebase.getCountFromServer(firebase.collection(firebase.db, "sessions", session.id, "registrations"));
        session.registeredCount = count.data().count;
      } catch { session.registeredCount = null; }
    }));
    dashboardOrganizers = currentProfile?.role === "admin"
      ? (await getDocs(collection(firebase.db, "users"))).docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      : [];
  }
  dashboardSessions = sessions;
  dashboardVisibleLimit = 25;
  dashboardMode = currentProfile?.role === "admin" ? dashboardMode : "sessions";
  $("#dashboardTabs").hidden = currentProfile?.role !== "admin";
  renderDashboardContent();
}

function dashboardDate(session) {
  const value = session.selectedDate || session.fixedDate || session.dateOptions?.map(option => option.startAt).sort()[0];
  const date = value ? zonedDate(value, sessionTimezone(session)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function timestampValue(value) {
  if (value?.toMillis) return value.toMillis();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function statusLabel(status) {
  return ({ date_poll: "Finding a date", find_players: "Finding players", closed: "Closed", cancelled: "Cancelled", archived: "Archived" })[status] || "Finding players";
}

const statusMarks = { date_poll: "◷", find_players: "♟", closed: "◆", cancelled: "×", archived: "▣" };

function renderStatusPill(status, label = statusLabel(status)) {
  return `<span class="status-pill status-${escapeHtml(status)}"><span class="status-mark" aria-hidden="true">${statusMarks[status] || "◆"}</span>${escapeHtml(label)}</span>`;
}

function renderEmptyState(title, copy = "", compact = false) {
  return `<div class="empty-state${compact ? " compact" : ""}"><img class="empty-state-art" src="assets/empty-town-vignette.png?v=1" alt="" loading="lazy"><div><h2>${escapeHtml(title)}</h2>${copy ? `<p>${escapeHtml(copy)}</p>` : ""}</div></div>`;
}

function sessionNeedsAttention(session) {
  if (!["date_poll", "find_players"].includes(session.status)) return false;
  const date = dashboardDate(session);
  return Boolean(date && date.getTime() < Date.now());
}

const difficultyDetails = {
  Beginner: { level: 1, hint: "Official base scripts or carefully selected beginner-friendly custom scripts. Suitable for new and learning players." },
  Intermediate: { level: 2, hint: "More complex base or custom scripts featuring mechanics such as madness, character changes, multiple Demons or jinxes." },
  Advanced: { level: 3, hint: "Homebrew characters, experimental content or alternative formats such as Musical Chairs and Whalebuffet. Expect unusual rules, intricate interactions and less predictable balance." }
};

function eventDifficulty(value) {
  return ({ Experienced: "Intermediate", Expert: "Advanced" })[value] || value;
}

const experienceDetails = {
  "Fresh Blood": "New to Clocktower or still learning how the game flows.",
  "Repeat Offender": "Comfortable with the core rules and more involved mechanics such as madness, character changes and unusual information.",
  "Criminal Mastermind": "Highly experienced, confident interpreting unfamiliar scripts and complex interactions, or has experience as a Storyteller."
};

function playerExperience(value) {
  return ({ Beginner: "Fresh Blood", Experienced: "Repeat Offender", Expert: "Criminal Mastermind" })[value] || value;
}

function experienceClass(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

function experienceOptions() {
  return `<option value="">Choose one</option>${Object.entries(experienceDetails).map(([level, description]) => `<option value="${level}">${level} — ${escapeHtml(description.replace(/\.$/, ""))}</option>`).join("")}`;
}

function renderExperienceGuide() {
  return `<div class="experience-guide">${Object.entries(experienceDetails).map(([level, description]) => `<div class="experience-level-${experienceClass(level)}"><strong>${level}</strong><span>${escapeHtml(description)}</span></div>`).join("")}</div>`;
}

function renderExperienceBadge(value) {
  const normalized = playerExperience(value);
  const description = experienceDetails[normalized];
  return description ? `<span class="experience-badge experience-${experienceClass(normalized)}" title="${escapeHtml(description)}">${escapeHtml(normalized)}</span>` : `<span class="experience-badge">${escapeHtml(normalized || "Unknown")}</span>`;
}

function renderDifficultyBadge(value) {
  const normalized = eventDifficulty(value);
  const detail = difficultyDetails[normalized];
  if (!detail) return '<span class="difficulty-badge difficulty-unset"><span class="difficulty-moons" aria-hidden="true"><i></i><i></i><i></i></span>Difficulty TBD</span>';
  const moons = [1, 2, 3].map(index => `<i class="${index <= detail.level ? "is-lit" : ""}"></i>`).join("");
  return `<span class="difficulty-badge difficulty-${normalized.toLowerCase()}" title="${detail.hint}"><span class="difficulty-moons" aria-hidden="true">${moons}</span>${normalized}</span>`;
}

function renderDashboardSessions() {
  const list = $("#sessionList");
  const query = $("#sessionSearch").value.trim().toLowerCase();
  const status = $("#sessionStatusFilter").value;
  const sort = $("#sessionSort").value;
  const matches = dashboardSessions.filter(session => {
    const haystack = [session.title, session.location, session.organizerName, storytellerNames(session), session.inviteSlug].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (status === "all" || session.status === status);
  }).sort((left, right) => {
    if (sort === "name") return String(left.title).localeCompare(String(right.title));
    if (sort === "updated") return timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt);
    return (dashboardDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (dashboardDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });
  const totals = Object.fromEntries(["date_poll", "find_players", "closed", "cancelled", "archived"].map(key => [key, dashboardSessions.filter(session => session.status === key).length]));
  const visible = matches.slice(0, dashboardVisibleLimit);
  $("#dashboardStats").innerHTML = `<div><strong>${dashboardSessions.length}</strong><span>Total</span></div><div><strong>${totals.date_poll}</strong><span>Finding dates</span></div><div><strong>${totals.find_players}</strong><span>Finding players</span></div><div><strong>${totals.closed + totals.cancelled + totals.archived}</strong><span>Finished</span></div>`;
  $("#sessionResultCount").textContent = visible.length === matches.length ? `${matches.length} shown` : `${visible.length} of ${matches.length} shown`;
  if (!dashboardSessions.length) {
    list.innerHTML = renderEmptyState("No gatherings yet", "Create your first session and invite the town.");
    return;
  }
  if (!matches.length) {
    list.innerHTML = renderEmptyState("No matching gatherings", "Try a different search or status filter.", true);
    return;
  }
  list.innerHTML = visible.map(session => {
    const date = dashboardDate(session);
    const isAdmin = currentProfile?.role === "admin";
    return `<article class="session-card ${sessionNeedsAttention(session) ? "needs-attention" : ""}">
      <div class="session-card-main"><div class="session-card-top">${renderStatusPill(session.status)}${sessionNeedsAttention(session) ? '<span class="status-pill status-attention"><span class="status-mark" aria-hidden="true">!</span>Needs attention</span>' : ""}${isAdmin ? `<span class="session-owner">${escapeHtml(session.organizerName || "Organiser")}</span>` : ""}</div>
      <h2>${escapeHtml(session.title)}</h2><div class="session-card-meta"><span>◷ ${date ? formatDate(date, sessionTimezone(session)) : `${session.dateOptions?.length || 0} dates proposed`}</span><span>⌖ ${escapeHtml(session.location || "Location TBD")}</span><span>♛ ${escapeHtml(storytellerNames(session))}</span><span>♟ ${Number.isInteger(session.registeredCount) ? `${session.registeredCount} registered · ` : ""}Up to ${Number(session.capacity) || 0}</span>${renderDifficultyBadge(session.difficulty)}</div>
      <code class="session-slug">${escapeHtml(session.inviteSlug || session.id)}</code></div>
      <div class="session-card-actions"><button class="button button-small button-ghost" data-copy-session="${session.id}" data-copy-slug="${escapeHtml(session.inviteSlug || "")}" type="button">Copy player link</button><button class="button button-small button-secondary" data-open-session="${session.id}" type="button">Manage</button><details class="card-more-menu"><summary aria-label="More actions">•••</summary><div><button class="button button-small button-danger" data-delete-session="${session.id}" type="button">Delete event</button></div></details></div>
    </article>`;
  }).join("") + (visible.length < matches.length ? '<button class="button button-ghost dashboard-load-more" data-load-more type="button">Show 25 more</button>' : "");
}

function renderOrganiserDirectory() {
  const list = $("#sessionList");
  const query = $("#sessionSearch").value.trim().toLowerCase();
  const status = $("#sessionStatusFilter").value;
  const profiles = [...dashboardOrganizers];
  dashboardSessions.forEach(session => {
    if (!profiles.some(profile => profile.id === session.ownerUid)) profiles.push({ id: session.ownerUid, displayName: session.organizerName || "Organiser", email: "" });
  });
  const groups = profiles.map(profile => {
    const allSessions = dashboardSessions.filter(session => session.ownerUid === profile.id);
    const sessions = allSessions.filter(session => status === "all" || session.status === status);
    const haystack = [profile.displayName, profile.email, ...allSessions.flatMap(session => [session.title, session.location, storytellerNames(session), session.inviteSlug])].join(" ").toLowerCase();
    return { profile, allSessions, sessions, matches: !query || haystack.includes(query) };
  }).filter(group => group.matches && (status === "all" || group.sessions.length)).sort((left, right) => String(left.profile.displayName || left.profile.email).localeCompare(String(right.profile.displayName || right.profile.email)));
  $("#sessionResultCount").textContent = `${groups.length} organiser${groups.length === 1 ? "" : "s"} shown`;
  if (!groups.length) {
    list.innerHTML = renderEmptyState("No matching organisers", "Try a different search or status filter.", true);
    return;
  }
  list.innerHTML = `<div class="organiser-directory">${groups.map(({ profile, allSessions, sessions }) => `<article class="organiser-card panel"><header><div class="organiser-avatar" aria-hidden="true">${escapeHtml((profile.displayName || profile.email || "O")[0].toUpperCase())}</div><div><h2>${escapeHtml(profile.displayName || "Organiser")}</h2>${profile.email ? `<p>${escapeHtml(profile.email)}</p>` : ""}</div><span class="status-pill">${allSessions.length} gathering${allSessions.length === 1 ? "" : "s"}</span></header><div class="organiser-session-list">${sessions.length ? sessions.map(session => { const date = dashboardDate(session); return `<div class="organiser-session-row"><div>${renderStatusPill(session.status)}<strong>${escapeHtml(session.title)}</strong><small>${date ? escapeHtml(formatDate(date, sessionTimezone(session))) : `${session.dateOptions?.length || 0} dates proposed`} · ${escapeHtml(storytellerNames(session))}</small></div><button class="button button-small button-secondary" data-open-session="${escapeHtml(session.id)}" type="button">Manage</button></div>`; }).join("") : '<p class="muted-copy">No gatherings match this status.</p>'}</div></article>`).join("")}</div>`;
}

function renderDashboardContent() {
  const admin = currentProfile?.role === "admin";
  dashboardMode = admin ? dashboardMode : "sessions";
  const totals = Object.fromEntries(["date_poll", "find_players", "closed", "cancelled", "archived"].map(key => [key, dashboardSessions.filter(session => session.status === key).length]));
  $("#dashboardStats").innerHTML = `<div><strong>${dashboardSessions.length}</strong><span>Total</span></div><div><strong>${totals.date_poll}</strong><span>Finding dates</span></div><div><strong>${totals.find_players}</strong><span>Finding players</span></div><div><strong>${totals.closed + totals.cancelled + totals.archived}</strong><span>Finished</span></div>`;
  $("#dashboardTitle").textContent = dashboardMode === "organizers" ? "Organisers" : admin ? "All gatherings" : "Your gatherings";
  $("#sessionSearch").placeholder = dashboardMode === "organizers" ? "Organiser, email, event or Storyteller…" : "Name, venue, Storyteller or link…";
  $$("[data-dashboard-tab]").forEach(button => { const selected = button.dataset.dashboardTab === dashboardMode; button.classList.toggle("is-active", selected); button.setAttribute("aria-selected", String(selected)); });
  if (dashboardMode === "organizers") renderOrganiserDirectory(); else renderDashboardSessions();
}

function updateDashboardFilters() {
  dashboardVisibleLimit = 25;
  renderDashboardContent();
}

async function loadSession(id) {
  if (demoMode) {
    const session = demoSessions.find(item => item.id === id) || null;
    if (session) session.scripts = normalizeSessionScripts(session);
    return session;
  }
  const snap = await firebase.getDoc(firebase.doc(firebase.db, "sessions", id));
  if (!snap.exists()) return null;
  const session = { id: snap.id, ...snap.data() };
  session.scripts = await loadScripts(session);
  session.registrations = await loadRegistrations(session);
  if (isPollStage(session)) session.counts = await loadDateCounts(session);
  else session.roster = await loadRoster(session.id);
  return session;
}

async function loadRegistrations(session) {
  if (!currentUser) return [];
  const base = firebase.collection(firebase.db, "sessions", session.id, "registrations");
  const source = isManager(session)
    ? base
    : firebase.query(base, firebase.where("createdByUid", "==", currentUser.uid));
  const snapshot = await firebase.getDocs(source);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

function normalizeSessionScripts(session, stored = session.scripts || []) {
  if (session.scriptMode !== "chosen") return stored;
  const legacy = {
    id: "legacy-script",
    name: session.scriptName || session.scriptData?.name || "Planned script",
    author: session.scriptData?.author || "",
    sourceType: session.scriptData?.characters?.length ? "json" : "pdf",
    pdfUrl: session.scriptUrl || "",
    scriptData: session.scriptData || null,
    legacy: true
  };
  const scripts = stored.some(script => script.name === legacy.name) ? stored : [...stored, legacy];
  return scripts.sort((left, right) => Number(Boolean(right.preferred)) - Number(Boolean(left.preferred)) || (left.order ?? 999) - (right.order ?? 999) || String(left.name).localeCompare(String(right.name)));
}

async function loadScripts(session) {
  const snapshot = await firebase.getDocs(firebase.collection(firebase.db, "sessions", session.id, "scripts"));
  const catalogue = await loadCharacterCatalogue();
  return normalizeSessionScripts(session, snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))).map(script => {
    if (!script.scriptData?.characters?.length) return script;
    const source = [{ id: "_meta", name: script.scriptData.name || script.name, author: script.scriptData.author || script.author }, ...script.scriptData.characters];
    return { ...script, scriptData: parseScriptJson(source, catalogue) };
  });
}

async function loadDateCounts(session) {
  const counts = {};
  await Promise.all((session.dateOptions || []).map(async option => {
    const snapshot = await firebase.getDocs(firebase.collection(firebase.db, "sessions", session.id, "dateOptions", option.id, "responses"));
    counts[option.id] = { available: 0, maybe: 0, unavailable: 0 };
    snapshot.forEach(docSnap => { const answer = docSnap.data().response; if (counts[option.id][answer] !== undefined) counts[option.id][answer]++; });
  }));
  return counts;
}

async function loadRoster(sessionId) {
  const snapshot = await firebase.getDocs(firebase.collection(firebase.db, "sessions", sessionId, "roster"));
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

function isManager(session) {
  if (demoMode) return demoManager;
  return currentUser && !currentUser.isAnonymous && (session.ownerUid === currentUser.uid || currentProfile?.role === "admin");
}

function isPollStage(session) {
  return !session.selectedDate && !session.fixedDate && Boolean(session.dateOptions?.length);
}

async function openSession(id, preserveUrl = false) {
  showView("sessionView");
  $("#sessionContent").innerHTML = '<div class="loading">Opening the town gates…</div>';
  try {
    if (!demoMode && !currentUser) await ensurePlayerUser();
    activeSession = await loadSession(id);
    if (!activeSession) throw new Error("That session could not be found.");
    const requestedScript = new URL(location.href).searchParams.get("script");
    const script = activeSession.scripts?.find(item => item.id === requestedScript);
    if (!preserveUrl) {
      const url = new URL(location.href); url.search = ""; url.searchParams.set("session", id);
      if (localDemo) url.searchParams.set("demo", "1");
      if (script) url.searchParams.set("script", script.id);
      history.replaceState({}, "", url);
    }
    if (script) renderScriptDetail(activeSession, script); else renderSession(activeSession);
  } catch (error) {
    $("#sessionContent").innerHTML = `<div class="panel error-panel"><h1>Session not found</h1><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderSession(session) {
  document.title = `${session.title} · Chaos Planner`;
  const manager = isManager(session);
  $(".header-actions").hidden = !manager;
  const date = session.selectedDate || session.fixedDate;
  const scriptCount = session.scripts?.length || 0;
  const script = scriptCount ? `<button class="inline-link" data-scroll-scripts type="button">${scriptCount} script${scriptCount === 1 ? "" : "s"} on offer</button>` : "Script TBD";
  const lifecycleNotice = session.status === "closed" ? '<div class="notice lifecycle-notice">Registration is closed. The roster remains visible.</div>' : session.status === "cancelled" ? '<div class="notice lifecycle-notice danger-notice">This gathering has been cancelled.</div>' : session.status === "archived" ? '<div class="notice lifecycle-notice">This gathering is archived and no longer accepts responses.</div>' : "";
  const lifecycleAction = session.status === "closed" ? '<button class="button button-small button-secondary" data-session-status="restore" type="button">Reopen</button>' : session.status === "cancelled" || session.status === "archived" ? '<button class="button button-small button-secondary" data-session-status="restore" type="button">Restore</button>' : '<button class="button button-small button-ghost" data-session-status="closed" type="button">Close registration</button>';
  $("#sessionContent").innerHTML = `
    <article class="session-hero panel session-status-${escapeHtml(session.status)}">
      <div class="session-status-line">${renderStatusPill(session.status)}</div>
      <h1>${escapeHtml(session.title)}</h1>
      <div class="session-facts">
        ${date ? `<div><span>Date</span><strong>${formatDate(date, sessionTimezone(session))}</strong></div>` : ""}
        <div><span>Location</span><strong>${escapeHtml(session.location)}</strong></div>
        <div><span>Storyteller${storytellerNames(session).includes(",") ? "s" : ""}</span><strong>${escapeHtml(storytellerNames(session))}</strong></div>
        <div><span>Script</span><strong>${script}</strong></div>
        <div><span>Time zone</span><strong>${escapeHtml(sessionTimezone(session))}</strong></div>
        <div class="difficulty-fact"><span>Difficulty</span><strong>${renderDifficultyBadge(session.difficulty)}</strong>${difficultyDetails[eventDifficulty(session.difficulty)] ? `<small class="difficulty-description">${escapeHtml(difficultyDetails[eventDifficulty(session.difficulty)].hint)}</small>` : ""}${manager ? `<select id="sessionDifficulty" class="difficulty-select" aria-label="Change event difficulty"><option value="">Choose level</option>${Object.keys(difficultyDetails).map(value => `<option value="${value}"${eventDifficulty(session.difficulty) === value ? " selected" : ""}>${value}</option>`).join("")}</select>` : ""}</div>
      </div>
      ${session.notes ? `<p class="session-notes">${escapeHtml(session.notes)}</p>` : ""}
      ${lifecycleNotice}
      <div class="share-row"><button id="copyLinkButton" class="button button-ghost" type="button">Copy player link</button>${date ? '<button class="button button-ghost" data-calendar type="button">Add to calendar</button>' : ""}<code>${escapeHtml(session.inviteSlug || session.id)}</code>${session.inviteSlug ? '<span class="status-pill">Custom link</span>' : ""}</div>
      ${manager ? `<div class="manager-action-bar"><button class="button button-small button-secondary" data-edit-session type="button">Edit event</button><button class="button button-small button-ghost" data-duplicate-session type="button">Duplicate</button>${lifecycleAction}<details class="manager-more-menu"><summary class="button button-small button-ghost">More actions</summary><div class="manager-more-popover">${session.status !== "cancelled" ? '<button class="button button-small button-danger" data-session-status="cancelled" type="button">Cancel event</button>' : ""}${session.status !== "archived" ? '<button class="button button-small button-ghost" data-session-status="archived" type="button">Archive event</button>' : ""}<button class="button button-small button-danger" data-delete-session="${escapeHtml(session.id)}" type="button">Delete permanently</button></div></details></div>` : ""}
    </article>
    <div class="session-workspace ${manager ? "manager-workspace" : "player-workspace"}">
      ${renderPlannedScripts(session, manager)}
      ${isPollStage(session) ? renderDatePoll(session, manager) : renderFindPlayers(session, manager)}
    </div>
  `;
}

function renderCharacterGroups(scriptData) {
  const characters = scriptData?.characters || [];
  const teams = [
    ["townsfolk", "Townsfolk"], ["outsider", "Outsiders"], ["minion", "Minions"], ["demon", "Demons"],
    ["traveller", "Travellers"], ["fabled", "Fabled"], ["loric", "Loric"], ["unknown", "Other"]
  ];
  const groups = teams.map(([team, label]) => {
    const members = characters.filter(character => character.team === team);
    if (!members.length) return "";
    return `<section class="script-team script-team-${team}"><h3>${label}<span>${members.length}</span></h3><div class="character-grid">${members.map(character => {
      const icon = officialTokenUrl(character.iconUrl);
      return `<article class="character-card">${icon ? `<img src="${escapeHtml(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}<span class="character-fallback" ${icon ? "hidden" : ""}>${escapeHtml(character.name?.[0] || "?")}</span><div><strong>${escapeHtml(character.name)}</strong>${character.ability ? `<p>${escapeHtml(character.ability)}</p>` : ""}</div></article>`;
    }).join("")}</div></section>`;
  }).join("");
  return groups;
}

function renderPlannedScripts(session, manager) {
  const scripts = session.scripts || [];
  const rows = scripts.map(script => {
    const characters = script.scriptData?.characters || [];
    const teamCounts = Object.fromEntries(["townsfolk", "outsider", "minion", "demon", "other"].map(team => [team, 0]));
    characters.forEach(character => { const team = teamCounts[character.team] === undefined ? "other" : character.team; teamCounts[team]++; });
    const strip = Object.entries(teamCounts).filter(([, count]) => count).map(([team, count]) => `<i class="team-${team}" style="--team-weight:${count}" title="${count} ${team}"></i>`).join("");
    const logo = BUILT_IN_SCRIPTS[script.edition]?.logo;
    return `<article class="planned-script-card${script.preferred ? " is-preferred" : ""}"><span class="script-team-strip" aria-hidden="true">${strip}</span><button class="planned-script-view" data-view-script="${escapeHtml(script.id)}" type="button">${logo ? `<img class="script-edition-logo" src="${logo}" alt="">` : ""}<span class="planned-script-name"><strong>${escapeHtml(script.name)}</strong>${script.author ? `<small>By ${escapeHtml(script.author)}</small>` : ""}</span><span class="script-card-meta">${characters.length} character${characters.length === 1 ? "" : "s"}</span>${script.preferred ? '<span class="preferred-ribbon">★ Preferred</span>' : ""}<span class="script-row-arrow" aria-hidden="true">→</span></button></article>`;
  }).join("");
  const management = manager && scripts.length ? `<details class="script-management"><summary>Manage scripts</summary><div class="script-management-list">${scripts.map((script, index) => `<div class="script-management-row"><span>${escapeHtml(script.name)}</span><div>${script.legacy ? "" : `<button class="icon-button" data-move-script="${escapeHtml(script.id)}" data-direction="up" type="button" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(script.name)} up">↑</button><button class="icon-button" data-move-script="${escapeHtml(script.id)}" data-direction="down" type="button" ${index === scripts.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(script.name)} down">↓</button>${script.preferred ? "" : `<button class="button button-small button-ghost" data-prefer-script="${escapeHtml(script.id)}" type="button">Prefer</button>`}` }<button class="icon-button danger" data-remove-script="${escapeHtml(script.id)}" data-script-name="${escapeHtml(script.name)}" type="button">Remove</button></div></div>`).join("")}</div></details>` : "";
  const addForm = manager ? `<details class="panel planned-script-manager"><summary>Add another script</summary><form id="plannedScriptForm" class="planned-script-form"><p>Choose an official base script or upload a BOTC script JSON. Official characters use official tokens; homebrew characters use a clear initial marker.</p>
      <label>Script<select name="scriptChoice" required><option value="" selected>Choose a script…</option><option value="tb">Trouble Brewing · built in</option><option value="bmr">Bad Moon Rising · built in</option><option value="snv">Sects &amp; Violets · built in</option><option value="upload">Upload custom JSON</option></select></label>
      <div data-planned-json-fields hidden><label>BOTC script JSON<input name="scriptJsonFile" type="file" accept=".json,application/json"><small class="field-hint">Supports standard character IDs and full homebrew character definitions.</small></label></div>
      <p id="scriptUploadError" class="form-error" role="alert" hidden></p><button class="button button-secondary" type="submit">Add planned script</button></form></details>` : "";
  return `<section id="plannedScripts" class="planned-scripts-section"><div class="script-offer-panel panel"><div class="script-offer-heading"><div><span class="eyebrow">Before you choose dates</span><h2>Scripts on offer</h2></div><p>${scripts.length ? "Check the possible games, then choose every date you can make." : "No scripts have been added yet. You can still choose your dates below."}</p></div>
    ${scripts.length ? `<div class="planned-script-list">${rows}</div>${management}` : renderEmptyState("No scripts announced", "The Storyteller can still add possibilities later.", true)}</div>${addForm}</section>`;
}

function renderScriptDetail(session, script) {
  document.title = `${script.name} · ${session.title}`;
  const pdfUrl = safeExternalUrl(script.pdfUrl);
  const characters = script.scriptData?.characters || [];
  $("#sessionContent").innerHTML = `<section id="scriptSheet" class="script-detail-view ${characters.length > 24 ? "print-dense" : ""}" data-character-count="${characters.length}">
    <button class="back-link no-print" data-back-session type="button">← Back to scripts & dates</button>
    <header class="script-detail-header panel">${BUILT_IN_SCRIPTS[script.edition] ? `<img class="script-detail-logo" src="${BUILT_IN_SCRIPTS[script.edition].logo}" alt="">` : ""}<div class="script-detail-copy"><div class="eyebrow">Planned script</div><h1>${escapeHtml(script.name)}</h1>${script.author ? `<p>By ${escapeHtml(script.author)}</p>` : ""}</div>
      <div class="script-detail-actions no-print">${characters.length ? '<button class="button button-ghost" data-print-script type="button">Print / save as PDF</button>' : ""}${pdfUrl ? `<a class="button button-secondary" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">Open PDF ↗</a>` : ""}</div></header>
    ${characters.length ? `<div class="script-section">${renderCharacterGroups(script.scriptData)}</div><p class="catalogue-credit no-print">Character details and icons use the current <a href="https://release.botc.app/resources/" target="_blank" rel="noopener noreferrer">official BOTC toolmaker resources ↗</a>, with the Townsquare catalogue as a fallback.</p><footer class="print-script-footer">Created with Chaos Planner · Unofficial community tool · Blood on the Clocktower is owned by Steven Medway and The Pandemonium Institute.</footer>` : pdfUrl ? `<div class="pdf-frame-wrap"><iframe class="pdf-frame" src="${escapeHtml(pdfUrl)}" title="${escapeHtml(script.name)} PDF"></iframe><p>If the PDF does not appear here, use “Open PDF” above.</p></div>` : '<div class="notice">This script has no character data or PDF link.</div>'}
  </section>`;
}

async function savePlannedScript(form) {
  const errorBox = $("#scriptUploadError"); errorBox.hidden = true;
  try {
    if ((activeSession.scripts || []).length >= 10) throw new Error("A session can have up to 10 planned scripts.");
    const fields = new FormData(form);
    const choice = fields.get("scriptChoice");
    if (BUILT_IN_SCRIPTS[choice] && activeSession.scripts.some(script => script.edition === choice)) throw new Error(`${BUILT_IN_SCRIPTS[choice].name} is already on offer.`);
    const selected = await scriptFromChoice(choice, fields.get("scriptJsonFile"));
    const script = { ...selected, order: activeSession.scripts.length, preferred: activeSession.scripts.length === 0 };
    if (demoMode) activeSession.scripts.push({ id: `script-${crypto.randomUUID()}`, ...script });
    else await firebase.addDoc(firebase.collection(firebase.db, "sessions", activeSession.id, "scripts"), { ...script, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
    showToast("Planned script added.");
    activeSession = await loadSession(activeSession.id); renderSession(activeSession);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

async function removePlannedScript(scriptId, scriptName) {
  if (!isManager(activeSession) || !confirm(`Remove “${scriptName}” from this event?`)) return;
  const script = activeSession.scripts.find(item => item.id === scriptId);
  try {
    if (demoMode) {
      activeSession.scripts = activeSession.scripts.filter(item => item.id !== scriptId);
      if (script?.legacy) Object.assign(activeSession, { scriptMode: "tbd", scriptName: "", scriptUrl: "", scriptData: null });
    } else if (script?.legacy) {
      await firebase.updateDoc(firebase.doc(firebase.db, "sessions", activeSession.id), { scriptMode: "tbd", scriptName: "", scriptUrl: "", scriptData: null, updatedAt: firebase.serverTimestamp() });
    } else {
      await firebase.deleteDoc(firebase.doc(firebase.db, "sessions", activeSession.id, "scripts", scriptId));
    }
    activeSession = await loadSession(activeSession.id); renderSession(activeSession); showToast("Planned script removed.");
  } catch (error) { showToast(`Could not remove script: ${error.message}`); }
}

async function reorderScripts(scriptId, direction) {
  if (!isManager(activeSession)) return;
  const scripts = [...activeSession.scripts];
  const index = scripts.findIndex(item => item.id === scriptId);
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || otherIndex < 0 || otherIndex >= scripts.length) return;
  [scripts[index], scripts[otherIndex]] = [scripts[otherIndex], scripts[index]];
  try {
    if (demoMode) scripts.forEach((script, order) => { script.order = order; });
    else {
      const batch = firebase.writeBatch(firebase.db);
      scripts.forEach((script, order) => { if (!script.legacy) batch.update(firebase.doc(firebase.db, "sessions", activeSession.id, "scripts", script.id), { order, updatedAt: firebase.serverTimestamp() }); });
      await batch.commit();
    }
    activeSession.scripts = scripts; renderSession(activeSession);
  } catch (error) { showToast(`Could not reorder scripts: ${error.message}`); }
}

async function preferScript(scriptId) {
  if (!isManager(activeSession)) return;
  try {
    if (demoMode) activeSession.scripts.forEach(script => { script.preferred = script.id === scriptId; });
    else {
      const batch = firebase.writeBatch(firebase.db);
      activeSession.scripts.forEach(script => { if (!script.legacy) batch.update(firebase.doc(firebase.db, "sessions", activeSession.id, "scripts", script.id), { preferred: script.id === scriptId, updatedAt: firebase.serverTimestamp() }); });
      await batch.commit();
    }
    activeSession = await loadSession(activeSession.id); renderSession(activeSession); showToast("Preferred script updated.");
  } catch (error) { showToast(`Could not update preferred script: ${error.message}`); }
}

function renderDatePoll(session, manager) {
  const responseOpen = session.status === "date_poll";
  const options = (session.dateOptions || []).map(option => {
    const count = session.counts?.[option.id] || { available: 0, maybe: 0, unavailable: 0 };
    const indicator = dateIndicator(count.available);
    return `<article class="date-card">
      <div class="date-card-head"><div><span class="date-day">${formatDate(option.startAt, sessionTimezone(session))}</span><span class="indicator ${indicator.tone}">${indicator.label}</span></div>
      ${manager && responseOpen ? `<button class="button button-small button-secondary" data-finalize="${option.id}" type="button">Choose this date</button>` : ""}</div>
      <div class="count-row"><span><b>${count.available}</b> Available</span><span><b>${count.maybe}</b> Maybe</span><span><b>${count.unavailable}</b> Unavailable</span></div>
      ${!manager && responseOpen ? `<fieldset class="response-group" data-option="${option.id}"><legend>Your response</legend>${["available","maybe","unavailable"].map(value => `<label><input type="radio" name="response-${option.id}" value="${value}" required><span>${value[0].toUpperCase() + value.slice(1)}</span></label>`).join("")}</fieldset>` : ""}
    </article>`;
  }).join("");
  return `<section class="stage-section"><div class="section-heading"><div><div class="eyebrow">Optional first stage</div><h2>Which nights can you make?</h2></div><p>Maybe responses are shown separately and never count toward a game-size threshold.</p></div>
    <div class="date-list">${options}</div>
    ${manager ? renderAvailabilityHeatmap(session) + (responseOpen ? '<div class="notice">Choosing a date moves the session to Find Players. Available players stay interested; Maybe players remain visibly unconfirmed.</div>' : "") + renderManagerRegistrations(session) + (responseOpen ? managerPlayerForm(session) : "") : renderOwnedRegistrations(session) + (responseOpen ? playerDetailsForm("Save player responses") : '<div class="notice">This event is not accepting new date responses.</div>')}
  </section>`;
}

function renderAvailabilityHeatmap(session) {
  const players = session.registrations || [];
  if (!players.length) return "";
  const cells = { available: ["A", "Available"], maybe: ["M", "Maybe"], unavailable: ["U", "Unavailable"] };
  const maximum = Math.max(0, ...session.dateOptions.map(option => session.counts?.[option.id]?.available || 0));
  const strongest = new Set(maximum ? session.dateOptions.filter(option => (session.counts?.[option.id]?.available || 0) === maximum).map(option => option.id) : []);
  const shortDate = value => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: sessionTimezone(session) }).format(zonedDate(value, sessionTimezone(session)));
  return `<section class="availability-panel panel"><div class="section-heading"><div><div class="eyebrow">At a glance</div><h2>Availability map</h2></div><p><span class="legend-token status-available">A</span> Available <span class="legend-token status-maybe">M</span> Maybe <span class="legend-token status-unavailable">U</span> Unavailable</p></div><div class="availability-scroll"><table class="availability-table"><thead><tr><th>Player</th>${session.dateOptions.map(option => `<th class="${strongest.has(option.id) ? "is-strongest" : ""}" title="${escapeHtml(formatDate(option.startAt, sessionTimezone(session)))}"><span>${escapeHtml(shortDate(option.startAt))}</span>${strongest.has(option.id) ? '<small>Best fit</small>' : ""}</th>`).join("")}</tr></thead><tbody>${players.map(player => `<tr><th>${escapeHtml(player.displayName)}</th>${session.dateOptions.map(option => { const response = player.responses?.[option.id] || "unavailable"; const detail = cells[response] || ["—", "No response"]; return `<td class="${strongest.has(option.id) ? "is-strongest" : ""}"><span class="availability-cell status-${response}" title="${detail[1]}">${detail[0]}</span></td>`; }).join("")}</tr>`).join("")}</tbody></table></div></section>`;
}

function renderFindPlayers(session, manager) {
  const roster = session.roster || [];
  const confirmed = roster.filter(player => player.interestStatus === "confirmed");
  const maybe = roster.filter(player => player.interestStatus === "maybe");
  const waitlist = roster.filter(player => player.interestStatus === "waitlist");
  const size = gameSize(confirmed.length);
  const registrationOpen = session.status === "find_players";
  return `<section class="stage-section">
    <div class="roster-summary panel"><div><div class="eyebrow">Find Players</div><h2>${size}</h2><p>${confirmed.length} confirmed of ${session.capacity} maximum${maybe.length ? ` · ${maybe.length} maybe` : ""}${waitlist.length ? ` · ${waitlist.length} waiting` : ""}</p></div><div class="capacity-ring" style="--fill:${Math.min(100, confirmed.length / session.capacity * 100)}%"><strong>${confirmed.length}</strong><span>/${session.capacity}</span></div></div>
    <div class="section-heading"><div><h2>Who’s gathering</h2><p>Every interested player appears here with their experience level.</p></div><details class="experience-key"><summary>Experience level guide</summary>${renderExperienceGuide()}</details></div>
    <div class="roster-grid">${roster.length ? roster.map(player => `<article class="player-card ${player.interestStatus === "maybe" ? "is-maybe" : player.interestStatus === "waitlist" ? "is-waitlist" : ""}"><span class="player-initial">${escapeHtml(player.displayName[0]?.toUpperCase() || "?")}</span><div class="player-identity"><strong>${escapeHtml(player.displayName)}</strong>${renderExperienceBadge(player.experience)}</div><div class="player-card-actions">${player.interestStatus === "maybe" ? '<em>Maybe · unconfirmed</em>' : player.interestStatus === "waitlist" ? '<em>Waitlist</em>' : '<em>Interested</em>'}${manager && player.interestStatus === "waitlist" && confirmed.length < session.capacity ? `<button class="button button-small button-secondary" data-promote-player="${escapeHtml(player.id)}" type="button">Promote</button>` : ""}${manager ? `<button class="icon-button danger" data-remove-player="${escapeHtml(player.id)}" data-player-name="${escapeHtml(player.displayName)}" type="button" aria-label="Remove ${escapeHtml(player.displayName)}">Remove</button>` : ""}</div></article>`).join("") : renderEmptyState("The square is quiet", "No players yet. Share the link to call the town together.", true)}</div>
    ${manager ? '<div class="notice">Only the public name and experience shown above are publicly readable. Player registration records remain private to the player and session managers.</div>' + renderManagerRegistrations(session) + (registrationOpen ? managerPlayerForm(session) : "") : renderOwnedRegistrations(session) + (registrationOpen ? playerDetailsForm(confirmed.length >= session.capacity ? "Join the waitlist" : "Register player interest") : '<div class="notice">This event is not accepting new registrations.</div>')}
  </section>`;
}

function responseSelect(name, selected = "") {
  return `<select name="${escapeHtml(name)}" required><option value="">Choose response</option>${["available", "maybe", "unavailable"].map(value => `<option value="${value}" ${selected === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select>`;
}

function renderOwnedRegistrations(session) {
  const registrations = demoMode ? (session.registrations || []).filter(player => player.createdByUid === demoPlayerUid) : (session.registrations || []);
  if (!registrations.length) return "";
  return `<section class="owned-registrations panel"><div class="section-heading"><div><div class="eyebrow">Your entries</div><h2>Edit registrations</h2></div><p>You can change names${session.status === "date_poll" ? " and date responses" : ""}. Experience is fixed after registration.</p></div>
    <div class="owned-registration-list">${registrations.map(player => `<details class="owned-registration"><summary><span><strong>${escapeHtml(player.displayName)}</strong>${renderExperienceBadge(player.experience)}</span><span>Edit</span></summary>
      <form class="edit-player-form" data-player-id="${escapeHtml(player.id)}"><div class="form-grid"><label>Name<input name="displayName" value="${escapeHtml(player.displayName)}" minlength="2" maxlength="40" required></label><label>Experience<input value="${escapeHtml(playerExperience(player.experience))}" disabled></label></div>
      ${session.status === "date_poll" ? `<div class="manager-response-list">${session.dateOptions.map(option => `<label>${formatDate(option.startAt, sessionTimezone(session))}${responseSelect(`response-${option.id}`, player.responses?.[option.id])}</label>`).join("")}</div>` : ""}
      <p class="form-error" role="alert" hidden></p><button class="button button-small button-secondary" type="submit">Save changes</button></form></details>`).join("")}</div>
  </section>`;
}

function renderManagerRegistrations(session) {
  const registrations = session.registrations || [];
  return `<details class="manager-registrations panel" ${session.status === "date_poll" ? "open" : ""}><summary><span>Manage all player records</span><small>${registrations.length} total</small></summary>
    ${registrations.length ? `<div class="manager-player-list">${registrations.map(player => `<div><span><strong>${escapeHtml(player.displayName)}</strong>${renderExperienceBadge(player.experience)}</span><button class="button button-small button-danger" data-remove-player="${escapeHtml(player.id)}" data-player-name="${escapeHtml(player.displayName)}" type="button">Remove</button></div>`).join("")}</div>` : renderEmptyState("No responses yet", "The player link is ready to share.", true)}
  </details>`;
}

function playerDetailsForm(buttonLabel) {
  return `<form id="playerForm" class="panel player-form"><h2>Register a player</h2><p>No account needed. Add yourself, then repeat for anyone else you’re responding for. Each name and experience level will be visible on the session roster if they become interested.</p>
    <div class="form-grid"><label>Name<input name="displayName" minlength="2" maxlength="40" autocomplete="name" required></label>
    <label>Experience<select name="experience" required>${experienceOptions()}</select></label></div>
    ${renderExperienceGuide()}
    <label class="consent-row"><input type="checkbox" name="consent" required><span>I’m happy for my name and experience to appear on this session’s public roster.</span></label>
    <p id="playerError" class="form-error" role="alert" hidden></p><button class="button button-primary" type="submit">${buttonLabel}</button></form>`;
}

function managerPlayerForm(session) {
  const responseFields = session.status === "date_poll" ? `<div class="manager-response-list">${session.dateOptions.map(option => `<label>${formatDate(option.startAt, sessionTimezone(session))}${responseSelect(`manager-response-${option.id}`)}</label>`).join("")}</div>` : "";
  return `<form id="playerForm" class="panel player-form" data-manager="true"><h2>Add a player</h2><p>Add as many players as needed. Manager-entered responses follow the same privacy and game-size rules.</p>
    <div class="form-grid"><label>Name<input name="displayName" minlength="2" maxlength="40" required></label><label>Experience<select name="experience" required>${experienceOptions()}</select></label></div>
    ${renderExperienceGuide()}
    ${responseFields}<label class="consent-row"><input type="checkbox" name="consent" required><span>I have permission to add this player’s name and experience to the session.</span></label>
    <p id="playerError" class="form-error" role="alert" hidden></p><button class="button button-secondary" type="submit">Add player</button></form>`;
}

async function ensurePlayerUser() {
  if (demoMode) return { uid: demoPlayerUid, isAnonymous: true };
  await firebase.auth.authStateReady();
  if (currentUser || firebase.auth.currentUser) {
    currentUser = currentUser || firebase.auth.currentUser;
    return currentUser;
  }
  const result = await firebase.signInAnonymously(firebase.auth);
  currentUser = result.user;
  return result.user;
}

async function submitPlayer(form) {
  const errorBox = $("#playerError"); errorBox.hidden = true;
  try {
    if (!["date_poll", "find_players"].includes(activeSession.status)) throw new Error("This event is not accepting responses.");
    const data = validatePlayer(Object.fromEntries(new FormData(form)));
    const user = await ensurePlayerUser();
    const playerId = demoMode ? `player-${crypto.randomUUID()}` : firebase.doc(firebase.collection(firebase.db, "sessions", activeSession.id, "registrations")).id;
    if (activeSession.status === "date_poll") {
      const responses = {};
      for (const option of activeSession.dateOptions) {
        const value = form.dataset.manager === "true"
          ? new FormData(form).get(`manager-response-${option.id}`)
          : document.querySelector(`input[name="response-${option.id}"]:checked`)?.value;
        if (!value) throw new Error("Choose Available, Maybe or Unavailable for every date.");
        responses[option.id] = value;
      }
      if (demoMode) {
        for (const [optionId, response] of Object.entries(responses)) activeSession.counts[optionId][response]++;
        activeSession.registrations.push({ id: playerId, ...data, createdByUid: user.uid, responses });
      } else {
        const batch = firebase.writeBatch(firebase.db);
        batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId), { ...data, createdByUid: user.uid, responses, updatedAt: firebase.serverTimestamp() });
        for (const [optionId, response] of Object.entries(responses)) batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "dateOptions", optionId, "responses", playerId), { response, updatedAt: firebase.serverTimestamp() });
        await batch.commit();
      }
      showToast("Player availability saved. You can add another player now.");
    } else {
      let confirmedCount = (activeSession.roster || []).filter(player => player.interestStatus === "confirmed").length;
      if (!demoMode) {
        const confirmedQuery = firebase.query(firebase.collection(firebase.db, "sessions", activeSession.id, "roster"), firebase.where("interestStatus", "==", "confirmed"));
        confirmedCount = (await firebase.getCountFromServer(confirmedQuery)).data().count;
      }
      const finalStatus = confirmedCount >= activeSession.capacity ? "waitlist" : "confirmed";
      if (demoMode) {
        activeSession.registrations.push({ id: playerId, ...data, createdByUid: user.uid, finalStatus });
        activeSession.roster.push({ id: playerId, ...data, interestStatus: finalStatus });
      }
      else {
        const batch = firebase.writeBatch(firebase.db);
        batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId), { ...data, createdByUid: user.uid, finalStatus, updatedAt: firebase.serverTimestamp() });
        batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "roster", playerId), { ...data, interestStatus: finalStatus, updatedAt: firebase.serverTimestamp() });
        await batch.commit();
      }
      showToast(finalStatus === "waitlist" ? "The session is full, so this player joined the waitlist." : "Player registered. You can add another player now.");
    }
    activeSession = await loadSession(activeSession.id); renderSession(activeSession);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

async function editPlayer(form) {
  const errorBox = $(".form-error", form); errorBox.hidden = true;
  try {
    const playerId = form.dataset.playerId;
    const displayName = String(new FormData(form).get("displayName") || "").trim();
    if (displayName.length < 2 || displayName.length > 40) throw new Error("Use a name between 2 and 40 characters.");
    const responses = {};
    if (activeSession.status === "date_poll") {
      const fields = new FormData(form);
      for (const option of activeSession.dateOptions) {
        const response = fields.get(`response-${option.id}`);
        if (!["available", "maybe", "unavailable"].includes(response)) throw new Error("Choose a response for every date.");
        responses[option.id] = response;
      }
    }
    if (demoMode) {
      const registration = activeSession.registrations.find(player => player.id === playerId && player.createdByUid === demoPlayerUid);
      if (!registration) throw new Error("That registration could not be found.");
      if (activeSession.status === "date_poll") {
        for (const option of activeSession.dateOptions) {
          const previous = registration.responses?.[option.id];
          if (previous && activeSession.counts[option.id]?.[previous] > 0) activeSession.counts[option.id][previous]--;
          activeSession.counts[option.id][responses[option.id]]++;
        }
        registration.responses = responses;
      } else {
        const rosterPlayer = activeSession.roster.find(player => player.id === playerId);
        if (rosterPlayer) rosterPlayer.displayName = displayName;
      }
      registration.displayName = displayName;
    } else {
      const batch = firebase.writeBatch(firebase.db);
      const registrationRef = firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId);
      const update = { displayName, updatedAt: firebase.serverTimestamp() };
      if (activeSession.status === "date_poll") {
        update.responses = responses;
        for (const [optionId, response] of Object.entries(responses)) batch.update(firebase.doc(firebase.db, "sessions", activeSession.id, "dateOptions", optionId, "responses", playerId), { response, updatedAt: firebase.serverTimestamp() });
      } else {
        batch.update(firebase.doc(firebase.db, "sessions", activeSession.id, "roster", playerId), { displayName, updatedAt: firebase.serverTimestamp() });
      }
      batch.update(registrationRef, update);
      await batch.commit();
    }
    showToast("Player details updated.");
    activeSession = await loadSession(activeSession.id); renderSession(activeSession);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

async function removePlayer(playerId, playerName) {
  if (!isManager(activeSession) || !confirm(`Remove ${playerName || "this player"} from this event?`)) return;
  try {
    if (demoMode) {
      const registration = activeSession.registrations.find(player => player.id === playerId);
      if (activeSession.status === "date_poll" && registration?.responses) {
        for (const [optionId, response] of Object.entries(registration.responses)) {
          if (activeSession.counts[optionId]?.[response] > 0) activeSession.counts[optionId][response]--;
        }
      }
      activeSession.registrations = activeSession.registrations.filter(player => player.id !== playerId);
      activeSession.roster = (activeSession.roster || []).filter(player => player.id !== playerId);
    } else {
      const batch = firebase.writeBatch(firebase.db);
      batch.delete(firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId));
      batch.delete(firebase.doc(firebase.db, "sessions", activeSession.id, "roster", playerId));
      for (const option of activeSession.dateOptions || []) batch.delete(firebase.doc(firebase.db, "sessions", activeSession.id, "dateOptions", option.id, "responses", playerId));
      await batch.commit();
    }
    showToast("Player removed.");
    activeSession = await loadSession(activeSession.id); renderSession(activeSession);
  } catch (error) { showToast(`Could not remove player: ${error.message}`); }
}

async function commitDeletes(refs) {
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = firebase.writeBatch(firebase.db);
    refs.slice(offset, offset + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteSession(sessionId) {
  const session = dashboardSessions.find(item => item.id === sessionId) || (activeSession?.id === sessionId ? activeSession : null);
  if (!session || !isManager(session) || !confirm(`Delete “${session.title}” and every player record? This cannot be undone.`)) return;
  try {
    if (demoMode) {
      demoSessions = demoSessions.filter(item => item.id !== sessionId);
    } else {
      const nested = ["scripts", "registrations", "roster"];
      const snapshots = await Promise.all(nested.map(name => firebase.getDocs(firebase.collection(firebase.db, "sessions", sessionId, name))));
      const responseSnapshots = await Promise.all((session.dateOptions || []).map(option => firebase.getDocs(firebase.collection(firebase.db, "sessions", sessionId, "dateOptions", option.id, "responses"))));
      await commitDeletes([...snapshots, ...responseSnapshots].flatMap(snapshot => snapshot.docs.map(item => item.ref)));
      const finalBatch = firebase.writeBatch(firebase.db);
      if (session.inviteSlug) {
        const inviteRef = firebase.doc(firebase.db, "inviteLinks", session.inviteSlug);
        if ((await firebase.getDoc(inviteRef)).exists()) finalBatch.delete(inviteRef);
      }
      finalBatch.delete(firebase.doc(firebase.db, "sessions", sessionId));
      await finalBatch.commit();
    }
    activeSession = null;
    showToast("Event and player data deleted.");
    history.replaceState({}, "", location.pathname);
    await openDashboard();
  } catch (error) { showToast(`Could not delete event: ${error.message}`); }
}

async function updateSessionDifficulty(value) {
  if (!difficultyDetails[value] || !activeSession || !isManager(activeSession)) return;
  try {
    if (demoMode) {
      activeSession.difficulty = value;
    } else {
      await firebase.updateDoc(firebase.doc(firebase.db, "sessions", activeSession.id), { difficulty: value, updatedAt: firebase.serverTimestamp() });
      activeSession.difficulty = value;
    }
    const dashboardCopy = dashboardSessions.find(session => session.id === activeSession.id);
    if (dashboardCopy) dashboardCopy.difficulty = value;
    renderSession(activeSession);
    showToast(`Difficulty set to ${value}.`);
  } catch (error) { showToast(`Could not change difficulty: ${error.message}`); }
}

function openEditSessionDialog() {
  if (!activeSession || !isManager(activeSession)) return;
  const form = $("#editSessionForm");
  form.elements.sessionId.value = activeSession.id;
  form.elements.title.value = activeSession.title || "";
  form.elements.inviteSlug.value = activeSession.inviteSlug || "";
  form.elements.storytellerNames.value = storytellerNames(activeSession);
  form.elements.location.value = activeSession.location || "";
  form.elements.capacity.value = activeSession.capacity || 15;
  form.elements.difficulty.value = eventDifficulty(activeSession.difficulty) || "Beginner";
  form.elements.notes.value = activeSession.notes || "";
  populateTimezoneSelect($("#editTimezone"), sessionTimezone(activeSession));
  const pollLocked = isPollStage(activeSession);
  form.elements.scheduledDate.closest("label").hidden = pollLocked;
  form.elements.scheduledDate.required = !pollLocked;
  $("#editPollDateNotice").hidden = !pollLocked;
  form.elements.scheduledDate.value = toDateTimeLocal(activeSession.selectedDate || activeSession.fixedDate, sessionTimezone(activeSession));
  $("#editSessionError").hidden = true;
  $("#editSessionDialog").showModal();
}

async function saveSessionEdits(form) {
  const errorBox = $("#editSessionError"); errorBox.hidden = true;
  try {
    if (!activeSession || !isManager(activeSession)) throw new Error("You cannot edit this event.");
    const fields = new FormData(form);
    const inviteSlug = normalizeInviteSlug(fields.get("inviteSlug"));
    const slugError = inviteSlugError(inviteSlug); if (slugError) throw new Error(slugError);
    const capacity = Number(fields.get("capacity"));
    if (!Number.isInteger(capacity) || capacity < 5 || capacity > 20) throw new Error("Maximum players must be between 5 and 20.");
    const timezone = validTimezone(fields.get("timezone")); if (!timezone) throw new Error("Choose a valid time zone.");
    const difficulty = eventDifficulty(fields.get("difficulty"));
    if (!difficultyDetails[difficulty]) throw new Error("Choose a valid event difficulty.");
    const update = { title: String(fields.get("title") || "").trim(), inviteSlug, storytellerNames: normalizeStorytellerNames(fields.get("storytellerNames")), location: String(fields.get("location") || "").trim(), capacity, difficulty, notes: String(fields.get("notes") || "").trim(), timezone };
    if (!update.title || !update.location) throw new Error("Session name and location are required.");
    const scheduledDate = fields.get("scheduledDate");
    if (!isPollStage(activeSession) && scheduledDate) {
      if (activeSession.selectedDate) update.selectedDate = scheduledDate; else update.fixedDate = scheduledDate;
    }
    if (demoMode) {
      if (demoSessions.some(session => session.id !== activeSession.id && session.inviteSlug === inviteSlug)) throw new Error("That custom player link is already in use.");
      Object.assign(activeSession, update);
    } else {
      const sessionRef = firebase.doc(firebase.db, "sessions", activeSession.id);
      if (inviteSlug !== activeSession.inviteSlug) {
        const newInviteRef = firebase.doc(firebase.db, "inviteLinks", inviteSlug);
        await firebase.runTransaction(firebase.db, async transaction => {
          if ((await transaction.get(newInviteRef)).exists()) throw new Error("That custom player link is already in use.");
          transaction.set(newInviteRef, { sessionId: activeSession.id, ownerUid: activeSession.ownerUid, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
          if (activeSession.inviteSlug) transaction.delete(firebase.doc(firebase.db, "inviteLinks", activeSession.inviteSlug));
          transaction.update(sessionRef, { ...update, updatedAt: firebase.serverTimestamp() });
        });
      } else await firebase.updateDoc(sessionRef, { ...update, updatedAt: firebase.serverTimestamp() });
    }
    $("#editSessionDialog").close();
    activeSession = await loadSession(activeSession.id); renderSession(activeSession); showToast("Event details updated.");
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

async function updateSessionStatus(requestedStatus) {
  if (!activeSession || !isManager(activeSession)) return;
  const restoreStatus = activeSession.selectedDate || activeSession.fixedDate ? "find_players" : "date_poll";
  const status = requestedStatus === "restore" ? restoreStatus : requestedStatus;
  if (!["date_poll", "find_players", "closed", "cancelled", "archived"].includes(status)) return;
  const verb = status === "cancelled" ? "cancel" : status === "archived" ? "archive" : status === "closed" ? "close registration for" : "restore";
  if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} “${activeSession.title}”?`)) return;
  try {
    if (demoMode) activeSession.status = status;
    else await firebase.updateDoc(firebase.doc(firebase.db, "sessions", activeSession.id), { status, updatedAt: firebase.serverTimestamp() });
    activeSession = await loadSession(activeSession.id); renderSession(activeSession); showToast(`Event is now ${statusLabel(status).toLowerCase()}.`);
  } catch (error) { showToast(`Could not update event: ${error.message}`); }
}

async function duplicateSession() {
  if (!activeSession || !isManager(activeSession)) return;
  try {
    const slug = `${normalizeInviteSlug(activeSession.inviteSlug || activeSession.title).slice(0, 38)}-copy-${Math.random().toString(36).slice(2, 6)}`;
    const status = activeSession.selectedDate || activeSession.fixedDate ? "find_players" : "date_poll";
    const copy = { ownerUid: demoMode ? "demo-organiser" : currentUser.uid, organizerName: demoMode ? "Demo Storyteller" : currentProfile.displayName, storytellerNames: storytellerNames(activeSession), title: `${activeSession.title} (Copy)`.slice(0, 80), location: activeSession.location || "", notes: activeSession.notes || "", capacity: activeSession.capacity, difficulty: eventDifficulty(activeSession.difficulty) || "Beginner", timezone: sessionTimezone(activeSession), visibility: "public", status, fixedDate: activeSession.fixedDate || null, selectedDate: activeSession.selectedDate || null, selectedOptionId: activeSession.selectedOptionId || null, dateOptions: structuredClone(activeSession.dateOptions || []), scriptMode: "tbd", scriptName: "", scriptUrl: "", scriptData: null, inviteSlug: slug };
    let id;
    const scripts = (activeSession.scripts || []).filter(script => !script.legacy).map(({ id: ignored, createdAt: ignoredCreated, updatedAt: ignoredUpdated, ...script }) => script);
    if (demoMode) {
      id = `demo-${crypto.randomUUID()}`;
      demoSessions.unshift({ id, ...copy, scripts: scripts.map((script, index) => ({ ...structuredClone(script), id: `script-${crypto.randomUUID()}`, order: index })), counts: Object.fromEntries(copy.dateOptions.map(option => [option.id, { available: 0, maybe: 0, unavailable: 0 }])), roster: [], registrations: [] });
    } else {
      const sessionRef = firebase.doc(firebase.collection(firebase.db, "sessions")); id = sessionRef.id;
      await firebase.runTransaction(firebase.db, async transaction => {
        transaction.set(sessionRef, { ...copy, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
        transaction.set(firebase.doc(firebase.db, "inviteLinks", slug), { sessionId: id, ownerUid: currentUser.uid, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
        scripts.forEach((script, index) => transaction.set(firebase.doc(firebase.collection(firebase.db, "sessions", id, "scripts")), { ...script, order: index, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() }));
      });
    }
    showToast("Event duplicated without player records."); await openSession(id);
  } catch (error) { showToast(`Could not duplicate event: ${error.message}`); }
}

async function promoteWaitlistedPlayer(playerId) {
  if (!isManager(activeSession)) return;
  const confirmed = activeSession.roster.filter(player => player.interestStatus === "confirmed").length;
  if (confirmed >= activeSession.capacity) { showToast("There is no free place yet."); return; }
  try {
    if (demoMode) {
      const player = activeSession.roster.find(item => item.id === playerId); if (player) player.interestStatus = "confirmed";
      const registration = activeSession.registrations.find(item => item.id === playerId); if (registration) registration.finalStatus = "confirmed";
    } else {
      const batch = firebase.writeBatch(firebase.db);
      batch.update(firebase.doc(firebase.db, "sessions", activeSession.id, "roster", playerId), { interestStatus: "confirmed", updatedAt: firebase.serverTimestamp() });
      batch.update(firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId), { finalStatus: "confirmed", updatedAt: firebase.serverTimestamp() });
      await batch.commit();
    }
    activeSession = await loadSession(activeSession.id); renderSession(activeSession); showToast("Player promoted from the waitlist.");
  } catch (error) { showToast(`Could not promote player: ${error.message}`); }
}

async function finalizeDate(optionId) {
  const option = activeSession.dateOptions.find(item => item.id === optionId);
  if (!option || !confirm(`Choose ${formatDate(option.startAt, sessionTimezone(activeSession))} as the final date?`)) return;
  if (demoMode) {
    activeSession.status = "find_players"; activeSession.selectedDate = option.startAt;
    const names = ["Alex", "Morgan", "Sam", "Quinn", "Jamie", "Avery", "Taylor", "Casey", "Jordan", "Drew"];
    const maybeNames = ["Riley", "Robin", "Ash", "Kit"];
    const levels = ["Fresh Blood", "Repeat Offender", "Criminal Mastermind"];
    const selectedCounts = activeSession.counts[optionId] || { available: 0, maybe: 0 };
    activeSession.roster = [
      ...names.slice(0, selectedCounts.available).map((displayName, index) => ({ id: `confirmed-${index}`, displayName, experience: levels[index % levels.length], interestStatus: "confirmed" })),
      ...maybeNames.slice(0, selectedCounts.maybe).map((displayName, index) => ({ id: `maybe-${index}`, displayName, experience: levels[(index + 1) % levels.length], interestStatus: "maybe" }))
    ];
  } else {
    const registrations = await firebase.getDocs(firebase.collection(firebase.db, "sessions", activeSession.id, "registrations"));
    const batch = firebase.writeBatch(firebase.db);
    let confirmedPlaces = 0;
    batch.update(firebase.doc(firebase.db, "sessions", activeSession.id), { status: "find_players", selectedDate: option.startAt, selectedOptionId: optionId, updatedAt: firebase.serverTimestamp() });
    registrations.forEach(reg => {
      const player = reg.data();
      const response = player.responses?.[optionId];
      let status = promotedStatus(response);
      if (status === "confirmed") {
        status = confirmedPlaces < activeSession.capacity ? "confirmed" : "waitlist";
        confirmedPlaces++;
      }
      const rosterRef = firebase.doc(firebase.db, "sessions", activeSession.id, "roster", reg.id);
      if (status) batch.set(rosterRef, { displayName: player.displayName, experience: player.experience, interestStatus: status, updatedAt: firebase.serverTimestamp() });
      else batch.delete(rosterRef);
      batch.update(reg.ref, { finalStatus: status || "not_available", updatedAt: firebase.serverTimestamp() });
    });
    await batch.commit();
  }
  showToast("Final date chosen. The session is now finding players.");
  activeSession = await loadSession(activeSession.id); renderSession(activeSession);
}

function resetCreateDialog() {
  $("#createChoice").hidden = false; $("#createFormPanel").hidden = true;
  $("#createSessionForm").reset(); $("#dateOptionList").innerHTML = ""; $("#createError").hidden = true;
  $("#scriptJsonStatus").textContent = "The script name and characters will be read automatically. Official characters use official tokens; homebrew characters use their initial. Players can print or save the displayed sheet as a PDF.";
  $("#scriptJsonFields").hidden = true;
  $("#dateSeriesStart").value = "";
  $("#dateSeriesInterval").value = "weekly";
  $("#dateSeriesCount").value = "4";
  $("#createSessionForm").elements.storytellerNames.value = demoMode ? "Demo Storyteller" : currentProfile?.displayName || currentUser?.displayName || "";
  inviteSlugEdited = false; updateInvitePreview();
  populateTimezoneSelect($("#createTimezone"));
}

function updateInvitePreview() {
  const slug = normalizeInviteSlug($("#inviteSlug").value);
  $("#invitePreview").textContent = slug ? buildSessionLink("new-session", slug) : "Enter a session name to generate the player link.";
}

function addDateOption(value = "") {
  const list = $("#dateOptionList"); if (list.children.length >= 10) return;
  const row = document.createElement("div"); row.className = "date-option-row";
  row.innerHTML = `<input type="datetime-local" name="dateOption" value="${escapeHtml(value)}" required><button type="button" aria-label="Remove date option">×</button>`;
  row.querySelector("button").addEventListener("click", () => { if (list.children.length > 2) row.remove(); });
  list.append(row);
}

function generateDateSeries() {
  const errorBox = $("#createError");
  try {
    const values = buildRecurringDates($("#dateSeriesStart").value, $("#dateSeriesInterval").value, Number($("#dateSeriesCount").value));
    $("#dateOptionList").innerHTML = "";
    values.forEach(addDateOption);
    errorBox.hidden = true;
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

function chooseCreateMode(mode) {
  createMode = mode; $("#createChoice").hidden = true; $("#createFormPanel").hidden = false;
  const poll = mode === "poll"; $("#fixedDateFields").hidden = poll; $("#pollDateFields").hidden = !poll;
  $("#createSessionForm").elements.fixedDate.required = !poll; $("#createFormTitle").textContent = poll ? "Find a date together" : "Set the date";
  if (poll && !$("#dateOptionList").children.length) { addDateOption(); addDateOption(); }
}

async function createSession(form) {
  const errorBox = $("#createError"); errorBox.hidden = true;
  try {
    const formData = new FormData(form);
    const dateOptions = createMode === "poll" ? buildDateOptions(formData.getAll("dateOption")) : [];
    if (createMode === "poll" && dateOptions.length < 2) throw new Error("Add at least two date and time options.");
    const scriptMode = formData.get("scriptMode");
    const selectedScript = scriptMode === "chosen" ? await scriptFromChoice(formData.get("scriptChoice"), formData.get("scriptJsonFile")) : null;
    const inviteSlug = normalizeInviteSlug(formData.get("inviteSlug"));
    const slugError = inviteSlugError(inviteSlug);
    if (slugError) throw new Error(slugError);
    const data = {
      ownerUid: demoMode ? "demo-organiser" : currentUser.uid,
      organizerName: demoMode ? "Demo Storyteller" : currentProfile.displayName,
      storytellerNames: normalizeStorytellerNames(formData.get("storytellerNames")),
      title: formData.get("title").trim(), location: formData.get("location").trim(), notes: formData.get("notes").trim(), timezone: validTimezone(formData.get("timezone")) || "Europe/London",
      capacity: Number(formData.get("capacity")), difficulty: formData.get("difficulty"), visibility: "public", status: createMode === "poll" ? "date_poll" : "find_players",
      fixedDate: createMode === "fixed" ? formData.get("fixedDate") : null, dateOptions,
      scriptMode, scriptName: scriptMode === "chosen" ? selectedScript.name : "", scriptUrl: "", scriptData: null, inviteSlug
    };
    const initialScript = scriptMode === "chosen" ? {
      ...selectedScript,
      order: 0,
      preferred: true
    } : null;
    let id;
    if (demoMode) {
      if (demoSessions.some(session => session.inviteSlug === inviteSlug)) throw new Error("That custom player link is already in use. Try another name.");
      id = `demo-${Math.random().toString(36).slice(2, 8)}`; demoSessions.unshift({ id, ...data, scripts: initialScript ? [{ id: `script-${crypto.randomUUID()}`, ...initialScript }] : [], counts: Object.fromEntries(dateOptions.map(option => [option.id, { available: 0, maybe: 0, unavailable: 0 }])), roster: [], registrations: [] });
    } else {
      const sessionRef = firebase.doc(firebase.collection(firebase.db, "sessions"));
      const inviteRef = firebase.doc(firebase.db, "inviteLinks", inviteSlug);
      const scriptRef = initialScript ? firebase.doc(firebase.collection(firebase.db, "sessions", sessionRef.id, "scripts")) : null;
      await firebase.runTransaction(firebase.db, async transaction => {
        const existing = await transaction.get(inviteRef);
        if (existing.exists()) throw new Error("That custom player link is already in use. Try another name.");
        transaction.set(inviteRef, { sessionId: sessionRef.id, ownerUid: currentUser.uid, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
        transaction.set(sessionRef, { ...data, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
        if (scriptRef) transaction.set(scriptRef, { ...initialScript, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
      });
      id = sessionRef.id;
    }
    $("#createDialog").close(); resetCreateDialog(); await renderDashboard();
    const url = new URL(location.href); url.search = ""; if (localDemo) url.searchParams.set("demo", "1"); url.searchParams.set("join", inviteSlug); history.replaceState({}, "", url);
    await openSession(id, true);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

document.addEventListener("click", async event => {
  const home = event.target.closest('[data-action="home"]'); if (home) { event.preventDefault(); history.replaceState({}, "", location.pathname); document.title = "Chaos Planner · Chaos On The Clocktower"; showView("homeView"); return; }
  const guide = event.target.closest('[data-action="guide"]'); if (guide) { event.preventDefault(); const url = new URL(location.href); url.search = ""; url.searchParams.set("guide", "1"); history.pushState({}, "", url); document.title = "How to use Chaos Planner"; showView("guideView"); scrollTo({ top: 0, behavior: "smooth" }); return; }
  const watch = event.target.closest('[data-action="watch"]'); if (watch) { event.preventDefault(); const url = new URL(location.href); url.search = ""; url.searchParams.set("watch", "1"); history.pushState({}, "", url); document.title = "Watch Chaos on the Clocktower"; showView("watchView"); return; }
  const episodeCard = event.target.closest("[data-episode-index]");
  if (episodeCard) { showEpisodeDetails(Number(episodeCard.dataset.episodeIndex), true); return; }
  const playEpisode = event.target.closest("[data-play-episode]");
  if (playEpisode) { loadEpisode(Number(playEpisode.dataset.playEpisode), Number(playEpisode.dataset.startSeconds || 0)); return; }
  const open = event.target.closest("[data-open-session]"); if (open) { await openSession(open.dataset.openSession); return; }
  const finalize = event.target.closest("[data-finalize]"); if (finalize) { await finalizeDate(finalize.dataset.finalize); return; }
  const removePlayerButton = event.target.closest("[data-remove-player]"); if (removePlayerButton) { await removePlayer(removePlayerButton.dataset.removePlayer, removePlayerButton.dataset.playerName); return; }
  const deleteSessionButton = event.target.closest("[data-delete-session]"); if (deleteSessionButton) { await deleteSession(deleteSessionButton.dataset.deleteSession); return; }
  if (event.target.closest("[data-edit-session]")) { openEditSessionDialog(); return; }
  if (event.target.closest("[data-duplicate-session]")) { await duplicateSession(); return; }
  const statusButton = event.target.closest("[data-session-status]"); if (statusButton) { await updateSessionStatus(statusButton.dataset.sessionStatus); return; }
  const promoteButton = event.target.closest("[data-promote-player]"); if (promoteButton) { await promoteWaitlistedPlayer(promoteButton.dataset.promotePlayer); return; }
  const removeScriptButton = event.target.closest("[data-remove-script]"); if (removeScriptButton) { await removePlannedScript(removeScriptButton.dataset.removeScript, removeScriptButton.dataset.scriptName); return; }
  const moveScriptButton = event.target.closest("[data-move-script]"); if (moveScriptButton) { await reorderScripts(moveScriptButton.dataset.moveScript, moveScriptButton.dataset.direction); return; }
  const preferScriptButton = event.target.closest("[data-prefer-script]"); if (preferScriptButton) { await preferScript(preferScriptButton.dataset.preferScript); return; }
  if (event.target.closest("[data-calendar]")) { downloadCalendar(activeSession); return; }
  const mode = event.target.closest("[data-create-mode]"); if (mode) chooseCreateMode(mode.dataset.createMode);
  const viewScript = event.target.closest("[data-view-script]");
  if (viewScript) {
    const script = activeSession.scripts?.find(item => item.id === viewScript.dataset.viewScript);
    if (script) { const url = new URL(location.href); url.searchParams.set("script", script.id); history.pushState({}, "", url); renderScriptDetail(activeSession, script); }
    return;
  }
  if (event.target.closest("[data-back-session]")) { const url = new URL(location.href); url.searchParams.delete("script"); history.pushState({}, "", url); renderSession(activeSession); $("#plannedScripts")?.scrollIntoView({ block: "start" }); return; }
  if (event.target.closest("[data-scroll-scripts]")) { $("#plannedScripts")?.scrollIntoView({ behavior: "smooth" }); return; }
  if (event.target.closest("[data-print-script]")) { document.body.classList.add("printing-script"); window.print(); setTimeout(() => document.body.classList.remove("printing-script"), 500); return; }
  if (event.target.id === "copyLinkButton") { await navigator.clipboard.writeText(buildSessionLink(activeSession.id, activeSession.inviteSlug)); showToast("Player link copied."); }
  const copy = event.target.closest("[data-copy-session]"); if (copy) { await navigator.clipboard.writeText(buildSessionLink(copy.dataset.copySession, copy.dataset.copySlug)); showToast("Player link copied."); }
  if (event.target.closest("[data-load-more]")) { dashboardVisibleLimit += 25; renderDashboardSessions(); }
  const dashboardTab = event.target.closest("[data-dashboard-tab]");
  if (dashboardTab) { dashboardMode = dashboardTab.dataset.dashboardTab; dashboardVisibleLimit = 25; renderDashboardContent(); }
});

$("#demoSessionButton").addEventListener("click", () => { demoManager = false; openSession("sample-night"); });
$("#dashboardButton").addEventListener("click", openDashboard);
$("#startOrganisingButton").addEventListener("click", openDashboard);
$("#sessionSearch").addEventListener("input", updateDashboardFilters);
$("#sessionStatusFilter").addEventListener("change", updateDashboardFilters);
$("#sessionSort").addEventListener("change", updateDashboardFilters);
$("#googleSignInButton").addEventListener("click", signInWithGoogle);
$("#signOutButton").addEventListener("click", async () => { await firebase?.signOut(firebase.auth); showView("homeView"); });
$("#createSessionButton").addEventListener("click", () => { resetCreateDialog(); $("#createDialog").showModal(); });
$("#backToChoice").addEventListener("click", resetCreateDialog);
$("#addDateOption").addEventListener("click", () => addDateOption());
$("#generateDateSeries").addEventListener("click", generateDateSeries);
$("#createSessionForm").addEventListener("change", async event => {
  const form = event.currentTarget;
  const changedField = event.target;
  if (event.target.name === "scriptMode") $("#scriptFields").hidden = event.target.value !== "chosen";
  if (event.target.name === "scriptChoice") $("#scriptJsonFields").hidden = event.target.value !== "upload";
  if (changedField.name === "scriptJsonFile" && changedField.files[0]) {
    const status = $("#scriptJsonStatus"); status.textContent = "Reading the grimoire…";
    try {
      const parsed = await readScriptFile(changedField.files[0]);
      status.textContent = `${parsed.characters.length} characters ready${parsed.author ? ` · by ${parsed.author}` : ""}.`;
      if (form.elements.scriptName && !form.elements.scriptName.value && parsed.name) form.elements.scriptName.value = parsed.name;
    } catch (error) { status.textContent = error.message; changedField.value = ""; }
  }
});
let inviteSlugEdited = false;
$("#createSessionForm").elements.title.addEventListener("input", event => { if (!inviteSlugEdited) { $("#inviteSlug").value = normalizeInviteSlug(event.target.value); updateInvitePreview(); } });
$("#inviteSlug").addEventListener("input", () => { inviteSlugEdited = true; updateInvitePreview(); });
$("#inviteSlug").addEventListener("blur", () => { $("#inviteSlug").value = normalizeInviteSlug($("#inviteSlug").value); updateInvitePreview(); });
$("#createSessionForm").addEventListener("submit", event => { event.preventDefault(); createSession(event.currentTarget); });
$("#editSessionForm").addEventListener("submit", event => { event.preventDefault(); saveSessionEdits(event.currentTarget); });
$("#sessionContent").addEventListener("submit", event => {
  if (event.target.id === "playerForm") { event.preventDefault(); submitPlayer(event.target); }
  if (event.target.matches(".edit-player-form")) { event.preventDefault(); editPlayer(event.target); }
  if (event.target.id === "plannedScriptForm") { event.preventDefault(); savePlannedScript(event.target); }
});
$("#sessionContent").addEventListener("change", event => {
  if (event.target.id === "sessionDifficulty") updateSessionDifficulty(event.target.value);
  if (event.target.name === "scriptChoice") event.target.form?.querySelector("[data-planned-json-fields]")?.toggleAttribute("hidden", event.target.value !== "upload");
});
window.addEventListener("popstate", () => {
  const currentUrl = new URL(location.href);
  if (currentUrl.searchParams.get("watch") === "1") { document.title = "Watch Chaos on the Clocktower"; showView("watchView"); return; }
  if (currentUrl.searchParams.get("guide") === "1") { document.title = "How to use Chaos Planner"; showView("guideView"); return; }
  if (!activeSession || $("#sessionView").hidden) { document.title = "Chaos Planner · Chaos On The Clocktower"; showView("homeView"); return; }
  const scriptId = currentUrl.searchParams.get("script");
  const script = activeSession.scripts?.find(item => item.id === scriptId);
  if (script) renderScriptDetail(activeSession, script); else renderSession(activeSession);
});

function initialiseHeroLogoEffect() {
  const stage = document.querySelector("[data-hero-logo-effect]");
  if (!stage) return;
  stage.dataset.heroLogoEffect = "glitch";
  stage.classList.add("effect-glitch");
}

initialiseHeroLogoEffect();
renderEpisodePicker();
showEpisodeDetails(0);
await initialiseFirebase();
updateAccountUi();
const initialUrl = new URL(location.href);
const initialInvite = initialUrl.searchParams.get("join");
const initialSession = initialUrl.searchParams.get("session");
const initialGuide = initialUrl.searchParams.get("guide") === "1";
const initialWatch = initialUrl.searchParams.get("watch") === "1";
if (initialInvite) openInvite(initialInvite); else if (initialSession) openSession(initialSession); else if (initialWatch) { document.title = "Watch Chaos on the Clocktower"; showView("watchView"); } else if (initialGuide) { document.title = "How to use Chaos Planner"; showView("guideView"); } else showView("homeView");
