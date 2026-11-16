# Digi Biashara Android app

This folder packages the existing Digi Biashara website in a native Android shell using Capacitor. It does not create a second database or a separate business system: the app connects to the configured HTTPS Digi Biashara website and continues using the same Supabase accounts and records.

## Build an APK

1. Open the repository's **Actions** tab.
2. Select **Build Digi Biashara Android APK**.
3. Choose **Run workflow** and keep the default verified preview URL for this test APK. Do not distribute this preview build to paying businesses.
4. When the workflow completes, open its run and download the **Digi-Biashara-Android-APK** artifact.
5. Extract the ZIP. The installable file is `Digi-Biashara-Android.apk`.
6. Send that APK file through Xender, WhatsApp, Bluetooth, USB, or another file-sharing app.

On the receiving Android phone, open the APK and allow installation from that file-sharing app if Android asks. Android may display a warning because this is a sideloaded app.

## Important

- This initial workflow produces a debug-signed APK for testing and direct sideloading. It is not a Google Play release.
- Keep the APK signing key private. A production/release APK needs a permanent signing key stored as protected GitHub Actions secrets; losing that key can prevent seamless app updates.
- The app loads the live website over HTTPS. Internet access is required for login, sales, M-Pesa, stock and reports.
- Changes deployed to the website appear in the app without reinstalling, because both use the same live system.
