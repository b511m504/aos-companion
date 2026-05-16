# Android Build Hygiene (Capacitor)

Stale UI behavior on device is usually caused by old web assets remaining in
`android/app/src/main/assets/public`, even after Java/Kotlin code is rebuilt.

If you see old NFC screens/copy after code changes, run this exact sequence:

1. Delete web build output  
   - `rm -rf dist`
2. Rebuild web assets  
   - `npm run build`
3. Sync Capacitor Android  
   - `npx cap sync android`
4. Delete copied web assets from Android project  
   - `android/app/src/main/assets/public`
5. Sync again (re-copy fresh assets)  
   - `npx cap sync android`
6. In Android Studio  
   - `Build -> Clean Project`  
   - `Build -> Rebuild Project`
7. Uninstall app from phone completely
8. Install fresh APK

## Why this matters

Capacitor apps embed built web files inside the APK. If old `public` assets are
left in the Android project, the app can launch old UI even when source code
looks updated in the repo.

Use the on-screen build stamp and logcat launch banner to verify the installed
APK is truly the latest build.

