import { firebaseConfig } from "./firebase-config.js";
import { buildDateOptions, dateIndicator, gameSize, inviteSlugError, normalizeInviteSlug, normalizeSessionCode, promotedStatus, validatePlayer } from "./domain.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const views = $$(".view");
const demoMode = firebaseConfig.apiKey === "REPLACE_ME" || firebaseConfig.projectId === "YOUR_PROJECT_ID";
let firebase = null;
let currentUser = null;
let currentProfile = null;
let authMode = "signin";
let createMode = "fixed";
let activeSession = null;
let demoSessions = [];
let demoManager = false;

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
  scriptMode: "tbd",
  scriptName: "",
  scriptUrl: "",
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
    const url = new URL(location.href); url.search = ""; url.searchParams.set("join", normalized); history.replaceState({}, "", url);
    await openSession(await resolveInvite(normalized), true);
  }
  catch (error) { $("#sessionContent").innerHTML = `<div class="panel error-panel"><h1>Link not found</h1><p>${escapeHtml(error.message)}</p></div>`; }
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#authTitle").textContent = signup ? "Create an organiser account" : "Welcome back";
  $("#authIntro").textContent = signup ? "Your account keeps your sessions under your control." : "Sign in to create and manage your sessions.";
  $("#displayNameLabel").hidden = !signup;
  $("#displayName").required = signup;
  $("#password").autocomplete = signup ? "new-password" : "current-password";
  $("#authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("#toggleAuthMode").textContent = signup ? "Already have an account? Sign in" : "New organiser? Create an account";
  $("#authError").hidden = true;
}

async function openDashboard() {
  if (!demoMode && (!currentUser || currentUser.isAnonymous)) {
    setAuthMode("signin");
    showView("authView");
    return;
  }
  if (demoMode) demoManager = true;
  showView("dashboardView");
  await renderDashboard();
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
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-state"><span>☾</span><h2>No gatherings yet</h2><p>Create your first session and invite the town.</p></div>';
    return;
  }
  list.innerHTML = sessions.map(session => {
    const date = session.selectedDate || session.fixedDate;
    return `<article class="session-card">
      <div><span class="status-pill">${session.status === "date_poll" ? "Finding a date" : "Finding players"}</span><h2>${escapeHtml(session.title)}</h2>
      <p>${date ? formatDate(date) : `${session.dateOptions?.length || 0} dates proposed`} · ${escapeHtml(session.location)}</p>
      <div class="share-box"><input readonly value="${escapeHtml(buildSessionLink(session.id, session.inviteSlug))}" aria-label="Player link"><button class="button button-small button-ghost" data-copy-session="${session.id}" data-copy-slug="${escapeHtml(session.inviteSlug || "")}" type="button">Copy link</button></div></div>
      <button class="button button-secondary" data-open-session="${session.id}" type="button">Manage</button>
    </article>`;
  }).join("");
}

async function loadSession(id) {
  if (demoMode) return demoSessions.find(session => session.id === id) || null;
  const snap = await firebase.getDoc(firebase.doc(firebase.db, "sessions", id));
  if (!snap.exists()) return null;
  const session = { id: snap.id, ...snap.data() };
  if (session.status === "date_poll") session.counts = await loadDateCounts(session);
  if (session.status === "find_players") session.roster = await loadRoster(session.id);
  return session;
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
    renderSession(activeSession);
    if (!preserveUrl) {
      const url = new URL(location.href); url.search = ""; url.searchParams.set("session", id); history.replaceState({}, "", url);
    }
  } catch (error) {
    $("#sessionContent").innerHTML = `<div class="panel error-panel"><h1>Session not found</h1><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderSession(session) {
  const manager = isManager(session);
  $(".header-actions").hidden = !manager;
  const date = session.selectedDate || session.fixedDate;
  const script = session.scriptMode === "chosen" ? `<a class="script-link" href="${escapeHtml(session.scriptUrl || "#")}" ${session.scriptUrl ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(session.scriptName || "Chosen script")}${session.scriptUrl ? " ↗" : ""}</a>` : "Script TBD";
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
    ${session.status === "date_poll" ? renderDatePoll(session, manager) : renderFindPlayers(session, manager)}
  `;
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
    const inviteSlug = normalizeInviteSlug(formData.get("inviteSlug"));
    const slugError = inviteSlugError(inviteSlug);
    if (slugError) throw new Error(slugError);
    if (scriptMode === "chosen" && !formData.get("scriptName")?.trim()) throw new Error("Give the chosen script a name.");
    const data = {
      ownerUid: demoMode ? "demo-organiser" : currentUser.uid,
      organizerName: demoMode ? "Demo Storyteller" : currentProfile.displayName,
      title: formData.get("title").trim(), location: formData.get("location").trim(), notes: formData.get("notes").trim(),
      capacity: Number(formData.get("capacity")), visibility: "public", status: createMode === "poll" ? "date_poll" : "find_players",
      fixedDate: createMode === "fixed" ? formData.get("fixedDate") : null, dateOptions,
      scriptMode, scriptName: scriptMode === "chosen" ? formData.get("scriptName").trim() : "", scriptUrl: scriptMode === "chosen" ? formData.get("scriptUrl").trim() : "", inviteSlug
    };
    let id;
    if (demoMode) {
      if (demoSessions.some(session => session.inviteSlug === inviteSlug)) throw new Error("That custom player link is already in use. Try another name.");
      id = `demo-${Math.random().toString(36).slice(2, 8)}`; demoSessions.unshift({ id, ...data, counts: Object.fromEntries(dateOptions.map(option => [option.id, { available: 0, maybe: 0, unavailable: 0 }])), roster: [] });
    } else {
      const sessionRef = firebase.doc(firebase.collection(firebase.db, "sessions"));
      const inviteRef = firebase.doc(firebase.db, "inviteLinks", inviteSlug);
      await firebase.runTransaction(firebase.db, async transaction => {
        const existing = await transaction.get(inviteRef);
        if (existing.exists()) throw new Error("That custom player link is already in use. Try another name.");
        transaction.set(inviteRef, { sessionId: sessionRef.id, ownerUid: currentUser.uid, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
        transaction.set(sessionRef, { ...data, createdAt: firebase.serverTimestamp(), updatedAt: firebase.serverTimestamp() });
      });
      id = sessionRef.id;
    }
    $("#createDialog").close(); resetCreateDialog(); await renderDashboard();
    const url = new URL(location.href); url.search = ""; url.searchParams.set("join", inviteSlug); history.replaceState({}, "", url);
    await openSession(id, true);
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

document.addEventListener("click", async event => {
  const home = event.target.closest('[data-action="home"]'); if (home) { history.replaceState({}, "", location.pathname); showView("homeView"); return; }
  const open = event.target.closest("[data-open-session]"); if (open) { await openSession(open.dataset.openSession); return; }
  const finalize = event.target.closest("[data-finalize]"); if (finalize) { await finalizeDate(finalize.dataset.finalize); return; }
  const mode = event.target.closest("[data-create-mode]"); if (mode) chooseCreateMode(mode.dataset.createMode);
  if (event.target.id === "copyLinkButton") { await navigator.clipboard.writeText(buildSessionLink(activeSession.id, activeSession.inviteSlug)); showToast("Player link copied."); }
  const copy = event.target.closest("[data-copy-session]"); if (copy) { await navigator.clipboard.writeText(buildSessionLink(copy.dataset.copySession, copy.dataset.copySlug)); showToast("Player link copied."); }
});

$("#demoSessionButton").addEventListener("click", () => { demoManager = false; openSession("sample-night"); });
$("#dashboardButton").addEventListener("click", openDashboard);
$("#startOrganisingButton").addEventListener("click", openDashboard);
$("#toggleAuthMode").addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
$("#signOutButton").addEventListener("click", async () => { await firebase?.signOut(firebase.auth); showView("homeView"); });
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault(); const errorBox = $("#authError"); errorBox.hidden = true;
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (authMode === "signup") {
      const result = await firebase.createUserWithEmailAndPassword(firebase.auth, data.email, data.password);
      await firebase.updateProfile(result.user, { displayName: data.displayName.trim() });
      await firebase.setDoc(firebase.doc(firebase.db, "users", result.user.uid), { displayName: data.displayName.trim(), email: data.email.toLowerCase(), role: "organizer", createdAt: firebase.serverTimestamp() });
      currentProfile = { displayName: data.displayName.trim(), role: "organizer" };
    } else await firebase.signInWithEmailAndPassword(firebase.auth, data.email, data.password);
    await openDashboard();
  } catch (error) { errorBox.textContent = error.code?.replace("auth/", "").replaceAll("-", " ") || error.message; errorBox.hidden = false; }
});
$("#createSessionButton").addEventListener("click", () => { resetCreateDialog(); $("#createDialog").showModal(); });
$("#backToChoice").addEventListener("click", resetCreateDialog);
$("#addDateOption").addEventListener("click", () => addDateOption());
$("#createSessionForm").addEventListener("change", event => { if (event.target.name === "scriptMode") $("#scriptFields").hidden = event.target.value !== "chosen"; });
let inviteSlugEdited = false;
$("#createSessionForm").elements.title.addEventListener("input", event => { if (!inviteSlugEdited) { $("#inviteSlug").value = normalizeInviteSlug(event.target.value); updateInvitePreview(); } });
$("#inviteSlug").addEventListener("input", () => { inviteSlugEdited = true; updateInvitePreview(); });
$("#inviteSlug").addEventListener("blur", () => { $("#inviteSlug").value = normalizeInviteSlug($("#inviteSlug").value); updateInvitePreview(); });
$("#createSessionForm").addEventListener("submit", event => { event.preventDefault(); createSession(event.currentTarget); });
$("#sessionContent").addEventListener("submit", event => { if (event.target.id === "playerForm") { event.preventDefault(); submitPlayer(event.target); } });

await initialiseFirebase();
updateAccountUi();
const initialUrl = new URL(location.href);
const initialInvite = initialUrl.searchParams.get("join");
const initialSession = initialUrl.searchParams.get("session");
if (initialInvite) openInvite(initialInvite); else if (initialSession) openSession(initialSession); else showView("homeView");
