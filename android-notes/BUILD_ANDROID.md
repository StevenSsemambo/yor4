# Building the Android app (Tier 2 — real closed-app alarms)

## Prerequisites
- Node.js (already needed for the web build)
- Android Studio (free, from developer.android.com) — this installs the
  Android SDK, emulator, and everything else needed
- A phone with USB debugging enabled, or an emulator from Android Studio,
  to actually test on

## First-time setup

```bash
npm install
npm run build          # produces dist/ — the web assets Capacitor wraps
npx cap add android     # generates an android/ folder — a full native project
npx cap sync             # copies dist/ into android/app/src/main/assets
```

`npx cap open android` opens the generated project in Android Studio. Let
Gradle sync finish (first time can take a few minutes — it's downloading
build tools).

## Every time you change the app afterward

```bash
npm run build
npx cap sync
```
Then re-run from Android Studio, or `npx cap open android` if you closed it.

## Getting an installable .apk

In Android Studio: `Build` menu → `Build Bundle(s) / APK(s)` → `Build APK(s)`.
When it finishes, a notification bar shows "locate" — the file lands in
`android/app/build/outputs/apk/debug/app-debug.apk`. That file can be
copied to a phone (via USB, a link, WhatsApp, whatever) and installed
directly — the phone will warn about "install from unknown sources," which
is expected for a debug APK not distributed through the Play Store.

## Testing the actual alarm behaviour

The whole point of this tier is that a scheduled reminder should fire even
after the app is fully closed. To verify that's really happening (not just
"still works because the app happened to be backgrounded"):

1. Create a reminder with a trigger time ~2 minutes out.
2. Grant notification permission when prompted (first time only).
3. Fully close the app — swipe it away from the recent-apps list, not just
   press home.
4. Wait. The alarm should fire from the OS notification tray at the
   scheduled time, app still closed.

If it doesn't fire: check that notification permission was actually
granted (Android settings → Apps → YoRemind → Notifications), and on some
manufacturers (Xiaomi, Huawei, some Samsung models) check that battery
optimisation / "autostart" restrictions aren't killing scheduled alarms —
this is a known Android manufacturer quirk unrelated to the app itself,
usually fixed by disabling battery optimisation for the app.

## Signing a release build (only needed once you're distributing beyond your
own testing)

Debug APKs work fine for your own device and sharing with testers directly.
A signed release build (needed for the Play Store, or a "cleaner" install
experience without the unknown-sources warning) requires generating a
keystore and configuring `android/app/build.gradle` — worth doing once
you're past testing and ready to actually distribute. Ask when you get
there and we'll set it up.
