# YoRemind — Offline (Phase 1b)

Same product, same "card catalog drawer" design as Phase 1 — but the backend
is gone. All data (reminders, debts, doses, meetings, ideas, history) lives
on-device in IndexedDB via Dexie. No server, no network calls, works fully
offline from the moment it loads.

This project can be shipped **two ways**, and they give you genuinely
different notification behaviour. Read this before you pick one.

## Tier 1 — Web PWA (deploy to Netlify, "Add to Home Screen")

```bash
npm install
npm run build
# deploy the dist/ folder to Netlify (drag-and-drop, or connect the repo)
```

What you get:
- Fully offline data — every reminder, payment, dose, and note is on the
  device, survives a reboot, works in airplane mode.
- Installable from the browser ("Add to Home Screen" on Android, same on
  iOS Safari's share sheet).
- Notifications fire **while the app is open, or backgrounded in a browser
  tab.** The moment the browser/PWA is fully closed (swiped away, not just
  minimised), the OS can't wake it to fire a scheduled alert — no browser
  can do this without a server pushing the notification in (Web Push), and
  we deliberately left that out to keep this tier a zero-backend static
  deploy. See the chat where we scoped this if you want the Web Push path
  added back later — it's a separate, smaller addition on top of this same
  codebase (Netlify Functions + a schedule store).

This tier is the right pick if "mostly-open-app" alerts are good enough,
or as your fastest path to something installable and shareable via a link.

## Tier 2, no local Android Studio — GitHub Actions builds the APK for you

If you don't have (or don't want to install) Android Studio, `.github/workflows/build-android.yml`
in this project builds the APK entirely in GitHub's cloud. All you need is
a free GitHub account.

1. Create a new **empty** GitHub repo (no README/license — this project
   already has its own).
2. Push this project's contents to it:
   ```bash
   cd yoremind-offline
   git init
   git add .
   git commit -m "YoRemind offline Phase 1b"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub, open the repo's **Actions** tab — a "Build Android APK"
   workflow run starts automatically (takes ~5–8 minutes: it's installing
   the Android SDK and compiling from scratch each time).
4. When it finishes (green checkmark), open that run and scroll to
   **Artifacts** at the bottom — `yoremind-debug-apk` is a zip containing
   `app-debug.apk`. Download it, unzip, transfer the `.apk` to your phone
   (email it to yourself, USB, WhatsApp — whatever's easiest), and install
   it (Android will warn about "unknown sources" — expected for a debug
   build not from the Play Store).

This is genuinely the same APK you'd get from Android Studio's
`Build APK(s)` button — GitHub's runner is just doing the compiling instead
of your laptop. The `android/` folder is already included in this zip
(pre-generated), so the workflow only has to run `npx cap sync` + Gradle,
not regenerate the whole native project.

## Tier 2, with Android Studio (if you want to actually develop the native side)

This wraps the exact same React code in a real native shell, which exposes
the actual OS alarm APIs (`AlarmManager` on Android) — the same mechanism
the phone's Clock app uses. A scheduled reminder fires even if the app was
never opened after boot, exactly like a native alarm.

```bash
npm install
npm run build
npx cap add android      # one-time — generates the android/ folder
npx cap sync              # copies dist/ into the native project
npx cap open android      # opens Android Studio
```

From Android Studio: `Build > Build Bundle(s)/APK(s) > Build APK(s)`, or hit
Run on a connected device/emulator. See `android-notes/BUILD_ANDROID.md` for
the full walkthrough including where the generated `.apk` ends up and how
to sideload it onto a phone for testing.

**This tier needs Android Studio installed locally** — it isn't something
that comes out of a Netlify deploy. That's the real trade-off versus Tier 1:
true closed-app alarms in exchange for a native build step instead of "push
a link."

An iOS build is also possible (`npx cap add ios`, needs Xcode + an Apple
Developer account for device installs) — same code, not covered in detail
here since you're targeting Android-first per the product's African-first
scope.

## What's identical to Phase 1

- The category model: DEBT / MEDICINE / MEETING / IDEA, one details "shape"
  per category, same fields.
- The card-catalog visual design — same tokens, same components, same copy.
- The `api` object's method names (`api.create`, `api.snooze`,
  `api.logPayment`, etc.) — `App.jsx` and every component are almost
  byte-identical to Phase 1. Only what's *underneath* `api.js` changed:
  fetch calls to Express became direct calls into `src/services/*.js`,
  which read/write Dexie instead of Postgres.

## What's different under the hood

| | Phase 1 (PERN) | Phase 1b (this) |
|---|---|---|
| Data storage | Postgres via Express API | IndexedDB via Dexie, on-device |
| Notifications | Web Push, server-triggered | Capacitor `LocalNotifications` — native OS alarms (Tier 2) or foreground/background-tab browser notifications (Tier 1) |
| Deploy | Node server + Postgres instance | Static `dist/` (Tier 1) or a built APK (Tier 2) |
| Multi-device sync | Possible (shared DB) | None — each install's data is local to that device only |

That last row is worth sitting with: going fully offline-first means you
give up automatic multi-device sync. If you ever want "add a reminder on
your laptop, see it on your phone," that needs a sync layer back — either
resurrecting a server, or something like a self-hosted CouchDB/PouchDB pair
that syncs when online. Flagging it now since it's the natural next question
once this is running.

## Notification scheduling — how it stays correct

Every mutation that changes a reminder's due time (`create`, `snooze`,
`logDose`, `resurface`, `updateStatus`, `remove`) re-syncs that reminder's
native alarm(s) immediately afterward, in `src/api.js`. The mapping between
a reminder and its scheduled native notification IDs lives in the
`notifSchedule` Dexie table (`src/notifications.js`), so an alarm is always
cancelled before a new one is scheduled — nothing stacks or goes stale.

Meetings get two alarms (lead-time + at-time), matching the Phase 1 push
logic. Debts, medicine, and ideas get one, fired at `trigger_at`.
