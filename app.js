import { firebaseConfig } from "./firebase-config.js";
import { buildDateOptions, dateIndicator, gameSize, inviteSlugError, normalizeInviteSlug, normalizeSessionCode, parseScriptJson, promotedStatus, validatePlayer } from "./domain.js";

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
let dashboardVisibleLimit = 25;
let characterCataloguePromise = null;

const sampleSession = {
  id: "sample-night",
  ownerUid: "demo-organiser",
  organizerName: "The Storyteller",
  title: "A night in Ravenswood Bluff",
  location: "The Old Bell, upstairs room",
  notes: "Arrive from 6:30pm. The first game begins at 7pm.",
  status: "date_poll",
  visibility: "public",
  capacity: 15,
  scriptMode: "chosen",
  scriptName: "Trouble Brewing",
  scriptUrl: "",
  scriptData: {
    name: "Trouble Brewing", author: "The Pandemonium Institute", characters: [
      { id: "washerwoman", name: "Washerwoman", team: "townsfolk", ability: "You start knowing that 1 of 2 players is a particular Townsfolk.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/washerwoman.png" },
      { id: "recluse", name: "Recluse", team: "outsider", ability: "You might register as evil and as a Minion or Demon, even if dead.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/recluse.png" },
      { id: "poisoner", name: "Poisoner", team: "minion", ability: "Each night, choose a player: they are poisoned tonight and tomorrow day.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/poisoner.png" },
      { id: "imp", name: "Imp", team: "demon", ability: "Each night, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/imp.png" }
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
  roster: []
};

sampleSession.scripts = [
  { id: "trouble-brewing", name: "Trouble Brewing", author: "The Pandemonium Institute", sourceType: "json", pdfUrl: "", scriptData: sampleSession.scriptData },
  { id: "bad-moon-rising", name: "Bad Moon Rising", author: "The Pandemonium Institute", sourceType: "json", pdfUrl: "", scriptData: { name: "Bad Moon Rising", author: "The Pandemonium Institute", characters: [
    { id: "grandmother", name: "Grandmother", team: "townsfolk", ability: "You start knowing a good player and their character. If the Demon kills them, you die too.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/grandmother.png" },
    { id: "lunatic", name: "Lunatic", team: "outsider", ability: "You think you are a Demon, but you are not. The Demon knows who you are and who you choose at night.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/lunatic.png" },
    { id: "devilsadvocate", name: "Devil's Advocate", team: "minion", ability: "Each night, choose a living player. If executed tomorrow, they do not die.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/devilsadvocate.png" },
    { id: "shabaloth", name: "Shabaloth", team: "demon", ability: "Each night, choose 2 players: they die. A dead player you chose last night might be regurgitated.", iconUrl: "https://raw.githubusercontent.com/bra1n/townsquare/develop/src/assets/icons/shabaloth.png" }
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
  $("#dashboardButton").textContent = signedIn ? "Dashboard" : "Organiser sign in";
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

async function loadCharacterCatalogue() {
  characterCataloguePromise ||= Promise.all([
    fetch("https://release.botc.app/resources/data/roles.json").then(response => response.ok ? response.json() : []).catch(() => []),
    fetch("https://raw.githubusercontent.com/bra1n/townsquare/develop/src/roles.json").then(response => response.ok ? response.json() : []).catch(() => [])
  ]).then(([official, community]) => {
    const roles = new Map();
    community.forEach(role => roles.set(String(role.id || "").toLowerCase(), role));
    official.forEach(role => roles.set(String(role.id || "").toLowerCase(), role));
    return [...roles.values()];
  });
  return characterCataloguePromise;
}

async function readScriptFile(file) {
  if (!file) return null;
  if (file.size > 250000) throw new Error("Keep the script JSON under 250 KB.");
  return parseScriptJson(await file.text(), await loadCharacterCatalogue());
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function toDateValue(value) {
  return value?.toDate ? value.toDate().toISOString() : value;
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
    $("#authError").hidden = true;
    showView("authView");
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
    sessions = demoSessions;
    $("#dashboardNotice").hidden = false;
  } else if (currentUser && !currentUser.isAnonymous) {
    const { collection, getDocs, query, where } = firebase;
    const base = collection(firebase.db, "sessions");
    const q = currentProfile?.role === "admin" ? query(base, where("visibility", "==", "public")) : query(base, where("ownerUid", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    sessions = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }
  dashboardSessions = sessions;
  dashboardVisibleLimit = 25;
  $("#dashboardTitle").textContent = currentProfile?.role === "admin" ? "All gatherings" : "Your gatherings";
  renderDashboardSessions();
}

function dashboardDate(session) {
  const value = session.selectedDate || session.fixedDate || session.dateOptions?.map(option => option.startAt).sort()[0];
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function timestampValue(value) {
  if (value?.toMillis) return value.toMillis();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function statusLabel(status) {
  return status === "date_poll" ? "Finding a date" : status === "closed" ? "Closed" : "Finding players";
}

function renderDashboardSessions() {
  const list = $("#sessionList");
  const query = $("#sessionSearch").value.trim().toLowerCase();
  const status = $("#sessionStatusFilter").value;
  const sort = $("#sessionSort").value;
  const matches = dashboardSessions.filter(session => {
    const haystack = [session.title, session.location, session.organizerName, session.inviteSlug].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (status === "all" || session.status === status);
  }).sort((left, right) => {
    if (sort === "name") return String(left.title).localeCompare(String(right.title));
    if (sort === "updated") return timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt);
    return (dashboardDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (dashboardDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });
  const totals = Object.fromEntries(["date_poll", "find_players", "closed"].map(key => [key, dashboardSessions.filter(session => session.status === key).length]));
  const visible = matches.slice(0, dashboardVisibleLimit);
  $("#dashboardStats").innerHTML = `<div><strong>${dashboardSessions.length}</strong><span>Total</span></div><div><strong>${totals.date_poll}</strong><span>Finding dates</span></div><div><strong>${totals.find_players}</strong><span>Finding players</span></div><div><strong>${totals.closed}</strong><span>Closed</span></div>`;
  $("#sessionResultCount").textContent = visible.length === matches.length ? `${matches.length} shown` : `${visible.length} of ${matches.length} shown`;
  if (!dashboardSessions.length) {
    list.innerHTML = '<div class="empty-state"><span>☾</span><h2>No gatherings yet</h2><p>Create your first session and invite the town.</p></div>';
    return;
  }
  if (!matches.length) {
    list.innerHTML = '<div class="empty-state compact"><p>No gatherings match those filters.</p></div>';
    return;
  }
  list.innerHTML = visible.map(session => {
    const date = dashboardDate(session);
    const isAdmin = currentProfile?.role === "admin";
    return `<article class="session-card">
      <div class="session-card-main"><div class="session-card-top"><span class="status-pill status-${escapeHtml(session.status)}">${statusLabel(session.status)}</span>${isAdmin ? `<span class="session-owner">${escapeHtml(session.organizerName || "Organiser")}</span>` : ""}</div>
      <h2>${escapeHtml(session.title)}</h2><div class="session-card-meta"><span>◷ ${date ? formatDate(date) : `${session.dateOptions?.length || 0} dates proposed`}</span><span>⌖ ${escapeHtml(session.location || "Location TBD")}</span><span>♟ Up to ${Number(session.capacity) || 0}</span></div>
      <code class="session-slug">${escapeHtml(session.inviteSlug || session.id)}</code></div>
      <div class="session-card-actions"><button class="button button-small button-ghost" data-copy-session="${session.id}" data-copy-slug="${escapeHtml(session.inviteSlug || "")}" type="button">Copy player link</button><button class="button button-small button-secondary" data-open-session="${session.id}" type="button">Manage</button></div>
    </article>`;
  }).join("") + (visible.length < matches.length ? '<button class="button button-ghost dashboard-load-more" data-load-more type="button">Show 25 more</button>' : "");
}

function updateDashboardFilters() {
  dashboardVisibleLimit = 25;
  renderDashboardSessions();
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
  if (session.status === "date_poll") session.counts = await loadDateCounts(session);
  if (session.status === "find_players") session.roster = await loadRoster(session.id);
  return session;
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
  if (stored.some(script => script.name === legacy.name)) return stored;
  return [...stored, legacy];
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

async function openSession(id, preserveUrl = false) {
  showView("sessionView");
  $("#sessionContent").innerHTML = '<div class="loading">Opening the town gates…</div>';
  try {
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
  $("#sessionContent").innerHTML = `
    <article class="session-hero panel">
      <div class="eyebrow">${session.status === "date_poll" ? "Finding a date" : "Finding players"}</div>
      <h1>${escapeHtml(session.title)}</h1>
      <div class="session-facts">
        ${date ? `<div><span>Date</span><strong>${formatDate(date)}</strong></div>` : ""}
        <div><span>Location</span><strong>${escapeHtml(session.location)}</strong></div>
        <div><span>Storyteller</span><strong>${escapeHtml(session.organizerName || "Organiser")}</strong></div>
        <div><span>Script</span><strong>${script}</strong></div>
      </div>
      ${session.notes ? `<p class="session-notes">${escapeHtml(session.notes)}</p>` : ""}
      <div class="share-row"><button id="copyLinkButton" class="button button-ghost" type="button">Copy player link</button><code>${escapeHtml(session.inviteSlug || session.id)}</code>${session.inviteSlug ? '<span class="status-pill">Custom link</span>' : ""}</div>
    </article>
    ${renderPlannedScripts(session, manager)}
    ${session.status === "date_poll" ? renderDatePoll(session, manager) : renderFindPlayers(session, manager)}
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
      const icon = safeExternalUrl(character.iconUrl);
      return `<article class="character-card">${icon ? `<img src="${escapeHtml(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}<span class="character-fallback" ${icon ? "hidden" : ""}>${escapeHtml(character.name?.[0] || "?")}</span><div><strong>${escapeHtml(character.name)}</strong>${character.ability ? `<p>${escapeHtml(character.ability)}</p>` : ""}</div></article>`;
    }).join("")}</div></section>`;
  }).join("");
  return groups;
}

function renderPlannedScripts(session, manager) {
  const scripts = session.scripts || [];
  const rows = scripts.map(script => `<button class="planned-script-row" data-view-script="${escapeHtml(script.id)}" type="button">
    <span class="planned-script-name"><strong>${escapeHtml(script.name)}</strong>${script.author ? `<small>By ${escapeHtml(script.author)}</small>` : ""}</span>
    <span class="script-source-badge">${script.sourceType === "json" ? "Characters" : "PDF"}</span><span class="script-row-arrow" aria-hidden="true">→</span>
  </button>`).join("");
  const addForm = manager ? `<details class="panel planned-script-manager"><summary>Add another script</summary><form id="plannedScriptForm" class="planned-script-form"><p>Upload JSON for the character view, or add a script name and PDF link.</p>
      <div class="script-methods"><label class="radio-row"><input type="radio" name="plannedSource" value="json" checked> BOTC JSON</label><label class="radio-row"><input type="radio" name="plannedSource" value="pdf"> Name + PDF</label></div>
      <div data-planned-json><label>BOTC script JSON<input name="scriptJsonFile" type="file" accept=".json,application/json"></label></div>
      <div data-planned-pdf class="form-grid" hidden><label>Script name<input name="scriptName" maxlength="100"></label><label>PDF link<input name="scriptUrl" type="url" inputmode="url" placeholder="https://…/script.pdf"></label></div>
      <p id="scriptUploadError" class="form-error" role="alert" hidden></p><button class="button button-secondary" type="submit">Add planned script</button></form></details>` : "";
  return `<section id="plannedScripts" class="planned-scripts-section"><div class="script-offer-panel panel"><div class="script-offer-heading"><div><span class="eyebrow">Before you choose dates</span><h2>Scripts on offer</h2></div><p>${scripts.length ? "Check the possible games, then choose every date you can make." : "No scripts have been added yet. You can still choose your dates below."}</p></div>
    ${scripts.length ? `<div class="planned-script-list">${rows}</div>` : ""}</div>${addForm}</section>`;
}

function renderScriptDetail(session, script) {
  document.title = `${script.name} · ${session.title}`;
  const pdfUrl = safeExternalUrl(script.pdfUrl);
  const characters = script.scriptData?.characters || [];
  $("#sessionContent").innerHTML = `<section id="scriptSheet" class="script-detail-view">
    <button class="back-link no-print" data-back-session type="button">← Back to scripts & dates</button>
    <header class="script-detail-header panel"><div><div class="eyebrow">Planned script</div><h1>${escapeHtml(script.name)}</h1>${script.author ? `<p>By ${escapeHtml(script.author)}</p>` : ""}</div>
      <div class="script-detail-actions no-print">${characters.length ? '<button class="button button-ghost" data-print-script type="button">Print / save as PDF</button>' : ""}${pdfUrl ? `<a class="button button-secondary" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">Open PDF ↗</a>` : ""}</div></header>
    ${characters.length ? `<div class="script-section">${renderCharacterGroups(script.scriptData)}</div><p class="catalogue-credit no-print">Character details and icons use the current <a href="https://release.botc.app/resources/" target="_blank" rel="noopener noreferrer">official BOTC toolmaker resources ↗</a>, with the Townsquare catalogue as a fallback.</p>` : pdfUrl ? `<div class="pdf-frame-wrap"><iframe class="pdf-frame" src="${escapeHtml(pdfUrl)}" title="${escapeHtml(script.name)} PDF"></iframe><p>If the PDF does not appear here, use “Open PDF” above.</p></div>` : '<div class="notice">This script has no character data or PDF link.</div>'}
  </section>`;
}

async function savePlannedScript(form) {
  const errorBox = $("#scriptUploadError"); errorBox.hidden = true;
  try {
    if ((activeSession.scripts || []).length >= 10) throw new Error("A session can have up to 10 planned scripts.");
    const fields = new FormData(form); const sourceType = fields.get("plannedSource");
    let scriptData = null; let name = ""; let author = ""; let pdfUrl = "";
    if (sourceType === "json") {
      const scriptFile = fields.get("scriptJsonFile");
      if (!scriptFile?.size) throw new Error("Choose a BOTC script JSON file.");
      scriptData = await readScriptFile(scriptFile);
      name = scriptData.name || scriptFile.name.replace(/\.json$/i, "").replace(/[-_]+/g, " ").trim() || "Uploaded script";
      author = scriptData.author || "";
    } else {
      name = String(fields.get("scriptName") || "").trim(); pdfUrl = safeExternalUrl(fields.get("scriptUrl"));
      if (!name) throw new Error("Enter the script name.");
      if (!pdfUrl) throw new Error("Enter a valid HTTPS PDF link.");
    }
    const script = { name, author, sourceType, pdfUrl, scriptData };
    if (demoMode) activeSession.scripts.push({ id: `script-${crypto.randomUUID()}`, ...script });
    else await firebase.addDoc(firebase.collection(firebase.db, "sessions", activeSession.id, "scripts"), { ...script, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
    showToast("Planned script added.");
    activeSession = await loadSession(activeSession.id); renderSession(activeSession);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

function renderDatePoll(session, manager) {
  const options = (session.dateOptions || []).map(option => {
    const count = session.counts?.[option.id] || { available: 0, maybe: 0, unavailable: 0 };
    const indicator = dateIndicator(count.available);
    return `<article class="date-card">
      <div class="date-card-head"><div><span class="date-day">${formatDate(option.startAt)}</span><span class="indicator ${indicator.tone}">${indicator.label}</span></div>
      ${manager ? `<button class="button button-small button-secondary" data-finalize="${option.id}" type="button">Choose this date</button>` : ""}</div>
      <div class="count-row"><span><b>${count.available}</b> Available</span><span><b>${count.maybe}</b> Maybe</span><span><b>${count.unavailable}</b> Unavailable</span></div>
      ${!manager ? `<fieldset class="response-group" data-option="${option.id}"><legend>Your response</legend>${["available","maybe","unavailable"].map(value => `<label><input type="radio" name="response-${option.id}" value="${value}" required><span>${value[0].toUpperCase() + value.slice(1)}</span></label>`).join("")}</fieldset>` : ""}
    </article>`;
  }).join("");
  return `<section class="stage-section"><div class="section-heading"><div><div class="eyebrow">Optional first stage</div><h2>Which nights can you make?</h2></div><p>Maybe responses are shown separately and never count toward a game-size threshold.</p></div>
    <div class="date-list">${options}</div>
    ${manager ? '<div class="notice">Choosing a date moves the session to Find Players. Available players stay interested; Maybe players remain visibly unconfirmed.</div>' + managerPlayerForm(session) : playerDetailsForm("Save player responses")}
  </section>`;
}

function renderFindPlayers(session, manager) {
  const roster = session.roster || [];
  const confirmed = roster.filter(player => player.interestStatus !== "maybe");
  const maybe = roster.filter(player => player.interestStatus === "maybe");
  const size = gameSize(confirmed.length);
  return `<section class="stage-section">
    <div class="roster-summary panel"><div><div class="eyebrow">Find Players</div><h2>${size}</h2><p>${confirmed.length} confirmed of ${session.capacity} maximum${maybe.length ? ` · ${maybe.length} maybe` : ""}</p></div><div class="capacity-ring" style="--fill:${Math.min(100, confirmed.length / session.capacity * 100)}%"><strong>${confirmed.length}</strong><span>/${session.capacity}</span></div></div>
    <div class="section-heading"><div><h2>Who’s gathering</h2><p>Every interested player appears here with their experience level.</p></div></div>
    <div class="roster-grid">${roster.length ? roster.map(player => `<article class="player-card ${player.interestStatus === "maybe" ? "is-maybe" : ""}"><span class="player-initial">${escapeHtml(player.displayName[0]?.toUpperCase() || "?")}</span><div><strong>${escapeHtml(player.displayName)}</strong><span>${escapeHtml(player.experience)}</span></div>${player.interestStatus === "maybe" ? '<em>Maybe · unconfirmed</em>' : '<em>Interested</em>'}</article>`).join("") : '<div class="empty-state compact"><p>No players yet. Share the link to begin.</p></div>'}</div>
    ${manager ? '<div class="notice">Only the public name and experience shown above are publicly readable. Player registration records remain private to the player and session managers.</div>' + managerPlayerForm(session) : (confirmed.length >= session.capacity ? '<div class="notice">This session has reached its player capacity.</div>' : playerDetailsForm("Register player interest"))}
  </section>`;
}

function playerDetailsForm(buttonLabel) {
  return `<form id="playerForm" class="panel player-form"><h2>Register a player</h2><p>No account needed. Add yourself, then repeat for anyone else you’re responding for. Each name and experience level will be visible on the session roster if they become interested.</p>
    <div class="form-grid"><label>Name<input name="displayName" minlength="2" maxlength="40" autocomplete="name" required></label>
    <label>Experience<select name="experience" required><option value="">Choose one</option><option>Beginner</option><option>Experienced</option><option>Expert</option></select></label></div>
    <label class="consent-row"><input type="checkbox" name="consent" required><span>I’m happy for my name and experience to appear on this session’s public roster.</span></label>
    <p id="playerError" class="form-error" role="alert" hidden></p><button class="button button-primary" type="submit">${buttonLabel}</button></form>`;
}

function managerPlayerForm(session) {
  const responseFields = session.status === "date_poll" ? `<div class="manager-response-list">${session.dateOptions.map(option => `<label>${formatDate(option.startAt)}<select name="manager-response-${option.id}" required><option value="">Choose response</option><option value="available">Available</option><option value="maybe">Maybe</option><option value="unavailable">Unavailable</option></select></label>`).join("")}</div>` : "";
  return `<form id="playerForm" class="panel player-form" data-manager="true"><h2>Add a player</h2><p>Add as many players as needed. Manager-entered responses follow the same privacy and game-size rules.</p>
    <div class="form-grid"><label>Name<input name="displayName" minlength="2" maxlength="40" required></label><label>Experience<select name="experience" required><option value="">Choose one</option><option>Beginner</option><option>Experienced</option><option>Expert</option></select></label></div>
    ${responseFields}<label class="consent-row"><input type="checkbox" name="consent" required><span>I have permission to add this player’s name and experience to the session.</span></label>
    <p id="playerError" class="form-error" role="alert" hidden></p><button class="button button-secondary" type="submit">Add player</button></form>`;
}

async function ensurePlayerUser() {
  if (demoMode) return { uid: `demo-${crypto.randomUUID()}` };
  if (currentUser) return currentUser;
  const result = await firebase.signInAnonymously(firebase.auth);
  return result.user;
}

async function submitPlayer(form) {
  const errorBox = $("#playerError"); errorBox.hidden = true;
  try {
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
      } else {
        const batch = firebase.writeBatch(firebase.db);
        batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId), { ...data, createdByUid: user.uid, responses, updatedAt: firebase.serverTimestamp() });
        for (const [optionId, response] of Object.entries(responses)) batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "dateOptions", optionId, "responses", playerId), { response, updatedAt: firebase.serverTimestamp() });
        await batch.commit();
      }
      showToast("Player availability saved. You can add another player now.");
    } else {
      if (demoMode) activeSession.roster.push({ id: playerId, ...data, interestStatus: "confirmed" });
      else {
        const batch = firebase.writeBatch(firebase.db);
        batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "registrations", playerId), { ...data, createdByUid: user.uid, finalStatus: "confirmed", updatedAt: firebase.serverTimestamp() });
        batch.set(firebase.doc(firebase.db, "sessions", activeSession.id, "roster", playerId), { ...data, interestStatus: "confirmed", updatedAt: firebase.serverTimestamp() });
        await batch.commit();
      }
      showToast("Player registered. You can add another player now.");
    }
    activeSession = await loadSession(activeSession.id); renderSession(activeSession);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

async function finalizeDate(optionId) {
  const option = activeSession.dateOptions.find(item => item.id === optionId);
  if (!option || !confirm(`Choose ${formatDate(option.startAt)} as the final date?`)) return;
  if (demoMode) {
    activeSession.status = "find_players"; activeSession.selectedDate = option.startAt;
    const names = ["Alex", "Morgan", "Sam", "Quinn", "Jamie", "Avery", "Taylor", "Casey", "Jordan", "Drew"];
    const maybeNames = ["Riley", "Robin", "Ash", "Kit"];
    const levels = ["Beginner", "Experienced", "Expert"];
    const selectedCounts = activeSession.counts[optionId] || { available: 0, maybe: 0 };
    activeSession.roster = [
      ...names.slice(0, selectedCounts.available).map((displayName, index) => ({ id: `confirmed-${index}`, displayName, experience: levels[index % levels.length], interestStatus: "confirmed" })),
      ...maybeNames.slice(0, selectedCounts.maybe).map((displayName, index) => ({ id: `maybe-${index}`, displayName, experience: levels[(index + 1) % levels.length], interestStatus: "maybe" }))
    ];
  } else {
    const registrations = await firebase.getDocs(firebase.collection(firebase.db, "sessions", activeSession.id, "registrations"));
    const batch = firebase.writeBatch(firebase.db);
    batch.update(firebase.doc(firebase.db, "sessions", activeSession.id), { status: "find_players", selectedDate: option.startAt, selectedOptionId: optionId, updatedAt: firebase.serverTimestamp() });
    registrations.forEach(reg => {
      const player = reg.data(); const status = promotedStatus(player.responses?.[optionId]);
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
  $("#scriptJsonStatus").textContent = "The script name and character list will be read automatically. Players can print or save the displayed sheet as a PDF.";
  $("#scriptJsonFields").hidden = false; $("#scriptPdfFields").hidden = true;
  inviteSlugEdited = false; updateInvitePreview();
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
    const scriptSource = formData.get("scriptSource");
    const scriptFile = formData.get("scriptJsonFile");
    const scriptData = scriptMode === "chosen" && scriptSource === "json" && scriptFile?.size ? await readScriptFile(scriptFile) : null;
    const inviteSlug = normalizeInviteSlug(formData.get("inviteSlug"));
    const slugError = inviteSlugError(inviteSlug);
    if (slugError) throw new Error(slugError);
    if (scriptMode === "chosen" && scriptSource === "json" && !scriptData) throw new Error("Choose a BOTC script JSON file.");
    if (scriptMode === "chosen" && scriptSource === "pdf" && !formData.get("scriptName")?.trim()) throw new Error("Enter the script name.");
    if (scriptMode === "chosen" && scriptSource === "pdf" && !safeExternalUrl(formData.get("scriptUrl"))) throw new Error("Enter a valid HTTPS PDF link.");
    const jsonScriptName = scriptData?.name || scriptFile?.name?.replace(/\.json$/i, "").replace(/[-_]+/g, " ").trim() || "Uploaded script";
    const data = {
      ownerUid: demoMode ? "demo-organiser" : currentUser.uid,
      organizerName: demoMode ? "Demo Storyteller" : currentProfile.displayName,
      title: formData.get("title").trim(), location: formData.get("location").trim(), notes: formData.get("notes").trim(),
      capacity: Number(formData.get("capacity")), visibility: "public", status: createMode === "poll" ? "date_poll" : "find_players",
      fixedDate: createMode === "fixed" ? formData.get("fixedDate") : null, dateOptions,
      scriptMode, scriptName: scriptMode === "chosen" ? (scriptSource === "json" ? jsonScriptName : formData.get("scriptName").trim()) : "", scriptUrl: scriptMode === "chosen" && scriptSource === "pdf" ? safeExternalUrl(formData.get("scriptUrl")) : "", scriptData: null, inviteSlug
    };
    const initialScript = scriptMode === "chosen" ? {
      name: data.scriptName,
      author: scriptData?.author || "",
      sourceType: scriptSource,
      pdfUrl: data.scriptUrl,
      scriptData
    } : null;
    let id;
    if (demoMode) {
      if (demoSessions.some(session => session.inviteSlug === inviteSlug)) throw new Error("That custom player link is already in use. Try another name.");
      id = `demo-${Math.random().toString(36).slice(2, 8)}`; demoSessions.unshift({ id, ...data, scripts: initialScript ? [{ id: `script-${crypto.randomUUID()}`, ...initialScript }] : [], counts: Object.fromEntries(dateOptions.map(option => [option.id, { available: 0, maybe: 0, unavailable: 0 }])), roster: [] });
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
  const home = event.target.closest('[data-action="home"]'); if (home) { history.replaceState({}, "", location.pathname); showView("homeView"); return; }
  const open = event.target.closest("[data-open-session]"); if (open) { await openSession(open.dataset.openSession); return; }
  const finalize = event.target.closest("[data-finalize]"); if (finalize) { await finalizeDate(finalize.dataset.finalize); return; }
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
$("#createSessionForm").addEventListener("change", async event => {
  const form = event.currentTarget;
  const changedField = event.target;
  if (event.target.name === "scriptMode") $("#scriptFields").hidden = event.target.value !== "chosen";
  if (event.target.name === "scriptSource") {
    const json = event.target.value === "json";
    $("#scriptJsonFields").hidden = !json; $("#scriptPdfFields").hidden = json;
  }
  if (changedField.name === "scriptJsonFile" && changedField.files[0]) {
    const status = $("#scriptJsonStatus"); status.textContent = "Reading the grimoire…";
    try {
      const parsed = await readScriptFile(changedField.files[0]);
      status.textContent = `${parsed.characters.length} characters ready${parsed.author ? ` · by ${parsed.author}` : ""}.`;
      if (!form.elements.scriptName.value && parsed.name) form.elements.scriptName.value = parsed.name;
    } catch (error) { status.textContent = error.message; changedField.value = ""; }
  }
});
let inviteSlugEdited = false;
$("#createSessionForm").elements.title.addEventListener("input", event => { if (!inviteSlugEdited) { $("#inviteSlug").value = normalizeInviteSlug(event.target.value); updateInvitePreview(); } });
$("#inviteSlug").addEventListener("input", () => { inviteSlugEdited = true; updateInvitePreview(); });
$("#inviteSlug").addEventListener("blur", () => { $("#inviteSlug").value = normalizeInviteSlug($("#inviteSlug").value); updateInvitePreview(); });
$("#createSessionForm").addEventListener("submit", event => { event.preventDefault(); createSession(event.currentTarget); });
$("#sessionContent").addEventListener("submit", event => {
  if (event.target.id === "playerForm") { event.preventDefault(); submitPlayer(event.target); }
  if (event.target.id === "plannedScriptForm") { event.preventDefault(); savePlannedScript(event.target); }
});
$("#sessionContent").addEventListener("change", event => {
  if (event.target.name !== "plannedSource") return;
  const form = event.target.closest("form"); const json = event.target.value === "json";
  $("[data-planned-json]", form).hidden = !json; $("[data-planned-pdf]", form).hidden = json;
});
window.addEventListener("popstate", () => {
  if (!activeSession || $("#sessionView").hidden) return;
  const scriptId = new URL(location.href).searchParams.get("script");
  const script = activeSession.scripts?.find(item => item.id === scriptId);
  if (script) renderScriptDetail(activeSession, script); else renderSession(activeSession);
});

await initialiseFirebase();
updateAccountUi();
const initialUrl = new URL(location.href);
const initialInvite = initialUrl.searchParams.get("join");
const initialSession = initialUrl.searchParams.get("session");
if (initialInvite) openInvite(initialInvite); else if (initialSession) openSession(initialSession); else showView("homeView");
