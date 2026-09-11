# Chaos Planner

**A BOTC Planner from Chaos On The Clocktower.** Organisers create sessions, optionally poll up to ten dates, and invite players with a public link. Players open that link directly—never the organiser login—and can register themselves and additional people without creating conventional accounts. Organisers and admins can also add as many players as needed from the management view.

Chaos Planner is an unofficial community tool. Blood on the Clocktower and its game content are owned by Steven Medway and The Pandemonium Institute; the planner is not affiliated with or endorsed by TPI. Review TPI's [Community Created Content Policy](https://bloodontheclocktower.com/pages/community-created-content-policy) before redistributing or commercialising the project.

The organiser dashboard is designed for a growing library of sessions: compact rows, at-a-glance totals, search by event/venue/storyteller/link, status filters, upcoming/recent/name sorting, and progressive batches of 25 results. Admins see the same tools across every organiser's gathering.

Chaos Planner uses the same custom-link convention as the IDP app: a readable `?join=friday-ravenswood-bluff` URL resolves through the top-level `inviteLinks` collection. The direct `?session=FIRESTORE_DOCUMENT_ID` format remains supported as a fallback.

The site is a static, mobile-first app for GitHub Pages. Firebase Authentication and Cloud Firestore provide identity and authoritative shared data. The placeholder configuration starts a clearly labelled in-memory preview; it does not use `localStorage` and does not persist data.

## Firebase setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Web app in **Project settings → Your apps**.
3. Copy its values into `firebase-config.js`, replacing every obvious placeholder.
4. In **Authentication → Sign-in method**, enable:
   - Google for organisers and admins. Choose a project support email when prompted.
   - Anonymous for players. This is invisible to players and only gives Firestore a secure per-device writer identity; players do not create or manage accounts.
5. Create a Cloud Firestore database in production mode.
6. Install the Firebase CLI, sign in, select the project, and deploy the included rules:

   ```sh
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,firestore:indexes
   ```

Do not launch with test-mode rules. `firestore.rules` is the security boundary and must be deployed before the public site.

### Admin access

The first time someone signs in with Google, the app creates their private `/users/{uid}` profile with the organiser role. Admin status is a privileged Firebase custom claim and cannot be granted from the browser. Set it from a trusted Admin SDK environment, then have that user sign out and in again:

```js
await getAuth().setCustomUserClaims("FIREBASE_USER_UID", { admin: true });
```

Admins can manage every session. Organisers can manage only sessions whose `ownerUid` matches their authenticated UID.

## Privacy model

- Session documents contain public event information only. Never put organiser email addresses or player contact details in them.
- `/users` is readable only by that user and admins.
- `/registrations` is readable only by the anonymous or signed-in identity that created that player entry, the session owner, and admins. One identity can securely create multiple player records.
- Date-response documents are publicly countable but contain only `available`, `maybe`, or `unavailable`; no names or contact information.
- `/inviteLinks/{slug}` can be fetched only by a signed-in or anonymous Firebase identity and cannot be listed. It contains only the target session ID and owner UID.
- The public roster contains only the player name and experience they explicitly consented to display, plus confirmed/maybe status.
- Firebase anonymous authentication prevents one player from overwriting another player’s response without requiring a visible account.

Review these choices against your privacy notice and local data-protection obligations before collecting real data.

## Script JSON and character display

Each session can list up to ten possible planned scripts. The main session page shows a compact list; selecting an entry opens a dedicated script view, keeping the player and date information uncluttered. Organisers can add either uploaded JSON or a script name and HTTPS PDF link. JSON is the recommended route because it creates the full colour-coded character display; that display includes a **Print / save as PDF** action. PDF entries open in the dedicated view and also have a direct-open fallback.

Planned scripts are stored in `/sessions/{sessionId}/scripts`, where they are publicly readable alongside the public session but writable only by that session's organiser or an admin. Older sessions with the previous single-script fields remain visible automatically.

Files exported by the [official BOTC Script Tool](https://script.bloodontheclocktower.com/) are supported: an optional `_meta` object followed by character IDs or complete character objects. The script name is read from `_meta.name`, with the JSON filename used as a fallback.

The file is parsed in the browser and only sanitised display fields are stored: character ID, name, team, ability, and an HTTPS icon URL. Files are limited to 250 KB and 80 displayed characters. Released characters are resolved from the current [official BOTC toolmaker resources](https://release.botc.app/resources/), including their team, ability and deterministic official icon URL. The open-source [BOTC Townsquare](https://github.com/bra1n/townsquare) catalogue remains a fallback. Already-uploaded entries with missing metadata are enriched again when opened, so newer characters no longer remain in “Other”. For a custom character, include its fields directly and use an HTTPS `image` or `imageUrl` value if an icon is available.

Characters are grouped and colour-coded on the public session page: deep blue Townsfolk, lighter blue Outsiders, orange Minions, and red Demons. Travellers, Fabled, and unknown custom teams use a neutral purple treatment.

## GitHub Pages setup

1. Push these files to the repository’s default branch.
2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Add the resulting Pages domain (for example `djsmartyp.github.io`) to **Firebase Authentication → Settings → Authorised domains**.
5. Open the Pages URL and verify organiser sign-in, anonymous player registration, and Firestore permission errors in a private browser window.

Because the app uses relative asset paths and query-string routing, it works from the repository subpath without a custom 404 page or build step.

## Local checks

Run the domain tests:

```sh
npm test
```

Serve the folder over HTTP (ES modules do not work reliably from `file://`):

```sh
npm run serve
```

For a local sample after Firebase is configured, open `http://127.0.0.1:4173/?demo=1&session=sample-night`. The `demo=1` switch works only on localhost. Exercise the live organiser and player flows using separate browser profiles.

## Brand asset

The header loads `assets/chaos-logo.png`. Replace that file in place to update the logo without changing any code. The supplied asset contains no event date, time, or Twitch branding.

Shared XP Gaming: <https://www.youtube.com/@SharedXPGaming>
