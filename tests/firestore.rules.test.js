import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment;

function human(uid, extra = {}) {
  return environment.authenticatedContext(uid, { email: `${uid}@example.test`, firebase: { sign_in_provider: "google.com" }, ...extra }).firestore();
}

function anonymous(uid) {
  return environment.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
}

const baseSession = {
  ownerUid: "owner-one", organizerName: "Storyteller", title: "Friday game", location: "Town Hall", notes: "", capacity: 7,
  difficulty: "Beginner", visibility: "public", status: "find_players", fixedDate: "2026-09-18T19:00", dateOptions: [],
  scriptMode: "tbd", scriptName: "", scriptUrl: "", scriptData: null, inviteSlug: "friday-game", timezone: "Europe/London"
};

describe("Firestore privacy and role rules", { skip: !hasEmulator }, () => {
  before(async () => {
    environment = await initializeTestEnvironment({ projectId: "chaos-planner-rules-test", firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") } });
  });
  after(async () => environment?.cleanup());
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "sessions", "owned"), baseSession);
      await setDoc(doc(db, "sessions", "other"), { ...baseSession, ownerUid: "owner-two", inviteSlug: "other-game" });
      await setDoc(doc(db, "sessions", "owned", "registrations", "private-player"), { displayName: "Private", experience: "Beginner", createdByUid: "anon-one", finalStatus: "confirmed" });
      await setDoc(doc(db, "sessions", "owned", "roster", "private-player"), { displayName: "Public name", experience: "Beginner", interestStatus: "confirmed" });
    });
  });

  it("keeps private registrations private while exposing only the public roster", async () => {
    const db = anonymous("anon-two");
    await assertFails(getDoc(doc(db, "sessions", "owned", "registrations", "private-player")));
    const roster = await assertSucceeds(getDoc(doc(db, "sessions", "owned", "roster", "private-player")));
    assert.equal(roster.data().displayName, "Public name");
  });

  it("lets an anonymous player register themselves but not impersonate another uid", async () => {
    const db = anonymous("anon-two");
    const batch = writeBatch(db);
    batch.set(doc(db, "sessions", "owned", "registrations", "player-two"), { displayName: "Player Two", experience: "Experienced", createdByUid: "anon-two", finalStatus: "confirmed" });
    batch.set(doc(db, "sessions", "owned", "roster", "player-two"), { displayName: "Player Two", experience: "Experienced", interestStatus: "confirmed" });
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(db, "sessions", "owned", "registrations", "impostor"), { displayName: "Impostor", experience: "Expert", createdByUid: "someone-else", finalStatus: "confirmed" }));
  });

  it("blocks new player registrations after cancellation", async () => {
    await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "sessions", "owned"), { status: "cancelled" }));
    const db = anonymous("anon-two");
    await assertFails(setDoc(doc(db, "sessions", "owned", "too-late"), { displayName: "Too Late", experience: "Beginner", createdByUid: "anon-two", finalStatus: "confirmed" }));
  });

  it("limits organisers to their events and lets admins manage every event", async () => {
    const owner = human("owner-one");
    await assertSucceeds(updateDoc(doc(owner, "sessions", "owned"), { notes: "Updated by owner", difficulty: "Intermediate" }));
    await assertFails(updateDoc(doc(owner, "sessions", "other"), { notes: "Not allowed" }));
    const admin = human("admin-user", { admin: true });
    await assertSucceeds(updateDoc(doc(admin, "sessions", "other"), { notes: "Updated by admin", difficulty: "Advanced" }));
  });

  it("accepts waitlist roster records and manager-controlled script ordering", async () => {
    const owner = human("owner-one");
    await assertSucceeds(setDoc(doc(owner, "sessions", "owned", "roster", "waitlisted"), { displayName: "Waiting Player", experience: "Beginner", interestStatus: "waitlist" }));
    await assertSucceeds(setDoc(doc(owner, "sessions", "owned", "scripts", "script-one"), { name: "Trouble Brewing", author: "TPI", sourceType: "json", pdfUrl: "", scriptData: { name: "Trouble Brewing", author: "TPI", characters: [] }, order: 0, preferred: true }));
  });
});
