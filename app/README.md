# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Running on device

This is a Windows dev machine — there's no Mac, so no local iOS builds or simulator. Everything
ships through EAS Build's cloud builders and gets installed straight onto a physical iPhone.

> **Note on `app.json`'s `ios.bundleIdentifier`:** it's currently set to the placeholder
> `com.darcy.soundingboard`. That's a plausible-looking value chosen so EAS Build has something to
> work with, not a value that's been reserved in App Store Connect. Before the first TestFlight/App
> Store submission (P3), confirm or change it to whatever bundle ID you actually register in your
> Apple Developer account — changing it later means a new App Store Connect app record.

Push-to-talk (speech-to-text via `expo-speech-recognition`, wrapping `SFSpeechRecognizer`)
**does not work in Expo Go** — it needs the native module compiled into a custom dev client. If you
run `npx expo start` and open the app in plain Expo Go, tapping-and-holding the mic will show a
"needs a development build" alert and you'll only be able to use typed input. Worker-backed TTS
playback (`expo-audio`) does work in Expo Go, since it has no native module beyond what Expo Go
already ships.

Steps to get a real dev build on your phone:

1. Log in to your Expo account (create one at [expo.dev](https://expo.dev) first if needed):

   ```bash
   npx eas login
   ```

2. Kick off a cloud build using the `development` profile from `eas.json` (installs
   `expo-dev-client`; internal distribution, so it installs directly, no TestFlight needed):

   ```bash
   npx eas build --profile development --platform ios
   ```

   The first run will prompt to create the EAS project (links `app.json` to a project on expo.dev)
   and to set up/confirm iOS credentials (EAS can generate and manage a provisioning
   profile + certificate for you — pick the automatic option unless you already manage your own).

3. When the build finishes, EAS prints a link (and QR code) to install it. Open that link on the
   iPhone you want to test with (Safari) and follow the install prompts. You'll need to add your
   device as a registered test device the first time — `eas build` walks you through that
   (`eas device:create`) if it isn't registered yet.

4. With the dev-client app installed on the phone, start the JS bundler on your PC and connect to
   it from the dev client (both need to be on the same Wi-Fi network, or use `--tunnel` if they
   can't reach each other directly):

   ```bash
   npx expo start --dev-client
   ```

   Scan the QR code from the dev-client app's launcher screen (not the Expo Go app — that's a
   different app and won't have the native speech-recognition module).

Re-run step 2 only when you add/change a native dependency or a config plugin (like the ones this
phase added: `expo-audio`, `expo-speech-recognition`, `expo-dev-client`). For pure JS/TS changes,
`npx expo start --dev-client` with the existing dev-client build is enough — no rebuild needed.

Use the `preview` profile the same way (`npx eas build --profile preview --platform ios`) once
RevenueCat/paywall work lands in P2, to test a build without the dev-client debug menu overlay.
`production` is for the eventual TestFlight/App Store submission in P3.

## Monetization setup (RevenueCat, SPEC.md §6)

The `react-native-purchases` wiring (`src/lib/purchases.ts`, `app/paywall.tsx`, `app/settings.tsx`'s
Restore Purchases) is code-complete but **inert without a RevenueCat project** — `initPurchases()`
no-ops when `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` is unset, so the app runs fine today with the
`__DEV__`-only manual Pro toggle on the paywall screen standing in for real purchases.

To make it real:

1. Create products `sb_monthly_999` ($9.99/mo) and `sb_annual_4999` ($49.99/yr) in **App Store
   Connect** (needs an active Apple Developer account) — In-App Purchases / Subscriptions section
   of the app record.
2. Create a free [RevenueCat](https://app.revenuecat.com) account and project, connect it to the
   App Store Connect app (RevenueCat's setup flow walks through the App Store Connect API key
   sharing step), and import the two products.
3. In the RevenueCat dashboard, create an **entitlement** and attach both products to it. The
   entitlement identifier must be `pro` — that's hardcoded as `PRO_ENTITLEMENT_ID` in
   `src/lib/purchases.ts`. (If you'd rather name it something else in the dashboard, update that
   constant to match instead.)
4. Create an **offering** with a `monthly` and `annual` package (RevenueCat's standard
   duration-based package types — `src/lib/purchases.ts` reads `offering.monthly`/`.annual`, not
   product identifiers) and mark it current.
5. Copy the **Apple App Store public API key** from RevenueCat's dashboard (Project Settings > API
   Keys) into `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` — in `app/.env.local` for local dev-client runs
   (step 4 of "Running on device" above), and in `eas.json`'s `env` block (or `eas env:create`) for
   `preview`/`production` builds, since those bundle the JS at build time rather than serving it
   live from your PC.
6. **`react-native-purchases` is a native module** — since it was added after any dev-client build
   you may already have, you need a fresh `npx eas build --profile development --platform ios` for
   it to actually be present on the installed dev client. (If this is your first-ever build, no
   extra step — it's included from the start.)
7. Testing a real purchase needs a **Sandbox Tester** Apple ID (App Store Connect > Users and
   Access > Sandbox Testers), signed into the *Sandbox* Apple ID slot in iOS Settings on the test
   device, not the device's real Apple ID.
