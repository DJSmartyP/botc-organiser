# Chaos Planner

**A BOTC Planner from Chaos On The Clocktower.** Organisers create sessions, optionally poll up to ten dates, and invite players with a public link. A date-series helper can generate daily, weekly or monthly options from one starting time, after which every option remains individually editable. Sessions support one or more named Storytellers. Players open the shared link directly—never the organiser login—and can register themselves and additional people without creating conventional accounts. Organisers and admins can also add as many players as needed from the management view.

Chaos Planner is an unofficial community tool. Blood on the Clocktower and its game content are owned by Steven Medway and The Pandemonium Institute; the planner is not affiliated with or endorsed by TPI. The official Community Created Content sleeve badge is displayed site-wide and is stored unchanged at `assets/community-created-content.png`, sourced from TPI's [toolmaker resources](https://release.botc.app/resources/). Review TPI's [Community Created Content Policy](https://bloodontheclocktower.com/pages/community-created-content-policy) before redistributing or commercialising the project.

The organiser dashboard is designed for a growing library of sessions: compact rows, live registration totals, attention markers for dates that have passed, search by event/venue/Storyteller/link, lifecycle filters, upcoming/recent/name sorting, and progressive batches of 25 results. Admins see and can edit the same tools across every organiser's gathering, plus an admin-only **Organisers** tab that groups accounts with all of their sessions. Managers can edit event details and custom links, close/reopen, cancel, archive, permanently delete, or duplicate an event without copying its player records.

The interface uses stage-specific status seals, contained action menus, team-coloured script summaries, and a highlighted best-fit date in the manager availability map. Trouble Brewing, Bad Moon Rising and Sects & Violets are built-in script choices; organisers can still upload custom BOTC JSON files. The built-ins use a local copy of TPI's published role catalogue and locally hosted official edition logos from the [toolmaker resources](https://release.botc.app/resources/). Empty states use the local `assets/empty-town-vignette.png` illustration, keeping the visual treatment reliable without a third-party image host.

On landscape and desktop layouts, the header uses its additional space for direct links to the official [Blood on the Clocktower Wiki and Almanac](https://wiki.bloodontheclocktower.com/Main_Page) and the [official online app](https://botc.app/). These reference shortcuts are hidden on narrow mobile layouts to preserve room for the primary account controls. Their local `official-botc-logo.png` and `official-app-puck.png` artwork was resized from TPI's official **BotC Public Media Library**, linked directly from the [Community Created Content Policy](https://bloodontheclocktower.com/pages/community-created-content-policy); the artwork itself is otherwise unchanged.

Player experience is defined consistently wherever it is selected or reviewed: **Fresh Blood** is new to Clocktower or still learning how the game flows; a **Repeat Offender** is comfortable with the core rules and more involved mechanics such as madness, character changes and unusual information; a **Criminal Mastermind** is highly experienced, confident interpreting unfamiliar scripts and complex interactions, or has experience as a Storyteller. Older registrations using Beginner/Experienced/Expert remain valid and are displayed under the corresponding new labels.

Event difficulty uses a separate colour-coded scale: **Beginner** means official base scripts or carefully selected beginner-friendly custom scripts, suitable for new and learning players; **Intermediate** means more complex base or custom scripts featuring mechanics such as madness, character changes, multiple Demons or jinxes; **Advanced** means homebrew characters, experimental content or alternative formats such as Musical Chairs and Whalebuffet, with unusual rules, intricate interactions and less predictable balance. Older events saved with the former Experienced/Expert labels are displayed as Intermediate/Advanced and are upgraded when edited or duplicated.

Chaos Planner uses the same custom-link convention as the IDP app: a readable `?join=friday-ravenswood-bluff` URL resolves through the top-level `inviteLinks` collection. The direct `?session=FIRESTORE_DOCUMENT_ID` format remains supported as a fallback.

The site is a static, mobile-first app for GitHub Pages. Firebase Authentication and Cloud Firestore provide identity and authoritative shared data. The placeholder configuration starts a clearly labelled in-memory preview; it does not use `localStorage` and does not persist data.

The dedicated **Chaos on the Clocktower** watch page presents a cinematic, locally hosted poster before loading the channel playlist through YouTube's privacy-enhanced `youtube-nocookie.com` player. YouTube is contacted only after the viewer chooses to play. Viewers can then choose any episode using the player's playlist control, move between episodes, use fullscreen, or open the complete playlist on YouTube. Because the player references the playlist rather than individual video IDs, newly added episodes appear automatically without a site deployment.

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
- Players can update only the display name and date responses on records created by their anonymous identity. They cannot change experience after registration, remove records, or edit roster status. This ownership follows the anonymous Firebase identity on that browser/device; secure cross-device recovery needs a trusted server-side handoff and is intentionally not simulated with insecure browser storage.
- Session organisers can remove player records from their own sessions and delete their own sessions. Admins can do this for every session. The app deletes nested registrations, response documents, roster entries, scripts, and the custom invite link before deleting an event because Firestore does not cascade subcollection deletes.
- Date-response documents are publicly countable but contain only `available`, `maybe`, or `unavailable`; no names or contact information.
- `/inviteLinks/{slug}` can be fetched only by a signed-in or anonymous Firebase identity and cannot be listed. It contains only the target session ID and owner UID.
- The public roster contains only the player name and experience they explicitly consented to display, plus confirmed/maybe/waitlist status. When capacity is reached, new entries join the waitlist and managers can promote them after a place opens.
- Firebase anonymous authentication prevents one player from overwriting another player’s response without requiring a visible account.

Review these choices against your privacy notice and local data-protection obligations before collecting real data.

## Script JSON and character display

Each session can list up to ten possible planned scripts. The main session page shows a compact list; selecting an entry opens a dedicated script view, keeping the player and date information uncluttered. Managers can reorder scripts, mark one as preferred, or remove it. Organisers can select one of the three built-in base editions or upload a BOTC JSON file; both routes create the same full colour-coded character display and **Print / save as PDF** action. Existing PDF-link entries from older builds remain readable, but the interface no longer creates them.

Planned scripts are stored in `/sessions/{sessionId}/scripts`, where they are publicly readable alongside the public session but writable only by that session's organiser or an admin. Older sessions with the previous single-script fields remain visible automatically.

Files exported by the [official BOTC Script Tool](https://script.bloodontheclocktower.com/) are supported: an optional `_meta` object followed by character IDs or complete character objects. The script name is read from `_meta.name`, with the JSON filename used as a fallback.

Built-in editions and uploaded JSON files use the same sanitised storage shape: character ID, name, team, ability, and an official icon URL. Uploaded files are parsed in the browser and limited to 250 KB and 80 displayed characters. Released characters are resolved from the current [official BOTC toolmaker resources](https://release.botc.app/resources/), including their team, ability and deterministic official token URL. The open-source [BOTC Townsquare](https://github.com/bra1n/townsquare) catalogue remains a metadata fallback only. Artwork URLs supplied by uploaded files are deliberately ignored: recognised official characters show the official token, while homebrew and unresolved characters show a styled initial-letter marker. Already-uploaded entries are normalised again when opened, so older custom image URLs are not displayed.

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

Run the browser regression checks (the local server must already be running, and Chrome must be installed at its standard Windows path):

```sh
npm run qa
```

The QA script checks the player view at desktop and 390px mobile widths, detects horizontal overflow, and verifies the manager controls and edit dialog.

The repository also includes emulator-backed rules tests covering organiser/admin boundaries, anonymous-player ownership, private registrations, cancelled-event writes, waitlists, and managed scripts. With a supported Java runtime available, run:

```sh
npm run test:rules
```

Serve the folder over HTTP (ES modules do not work reliably from `file://`):

```sh
npm run serve
```

For a local sample after Firebase is configured, open `http://127.0.0.1:4173/?demo=1&session=sample-night`. The `demo=1` switch works only on localhost. Exercise the live organiser and player flows using separate browser profiles.

## Brand asset

The header loads `assets/chaos-logo.png`. Replace that file in place to update the logo without changing any code. The supplied asset contains no event date, time, or Twitch branding.

Chaos on the Clocktower playlist: <https://www.youtube.com/playlist?list=PLpw9gMGspkwSc155CHY0HjyAq5_BYGGra>
