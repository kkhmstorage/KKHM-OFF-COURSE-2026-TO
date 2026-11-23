# Android App Build & Installation Guide

## KKHM Islamic & Arts College — Off-Course Activity Management System

You can install **KKHM AMS** on Android phones in **two free ways**:

---

## Option 1: Download & Install the Native Android APK (Built Automatically on GitHub)

This repository includes a complete **Capacitor Android** setup and a free GitHub Actions workflow (`.github/workflows/build-android-apk.yml`) that compiles **`KKHM-AMS-Android.apk`** automatically in the cloud (no Android Studio needed on your computer).

### Steps to Get Your APK
1. Push the updated code to your GitHub repository (`main` branch).
2. Open your repository on GitHub and click the **Actions** tab.
3. Click **Build Android APK (KKHM AMS)** and wait ~2–3 minutes for the green checkmark (✓).
4. Download **`KKHM-AMS-Android.apk`** from either:
   - Your repository's **Releases** page (right sidebar -> **Releases** -> `KKHM-AMS-Android.apk`), **OR**
   - Inside the completed **Build Android APK** workflow run -> **Artifacts** -> `KKHM-AMS-Android-APK`.
5. Transfer or open **`KKHM-AMS-Android.apk`** on an Android phone (Android 7.0+).
   - If Android asks, tap **Settings -> Allow from this source** and then tap **Install**.

> **Note:** Make sure your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` GitHub Secrets are configured before running the Android APK workflow so the compiled APK connects directly to your live Supabase PostgreSQL database.

---

## Option 2: Instant Install via Chrome (Zero Download / Auto-Updating PWA)

1. Open your published GitHub Pages link (`https://kkhmstorage.github.io/KKHM-OFF-COURSE-2026-TO/`) in **Google Chrome** on Android.
2. Tap the **Install App** button in the top bar (or Chrome menu `⋮` -> **Install app** / **Add to Home screen**).
3. The KKHM AMS icon appears on the Android home screen and opens full-screen like a native app, with automatic updates whenever you update GitHub Pages.

---

## Optional: Building Locally in Android Studio

If you want to customize or generate a Play Store signed `.aab` bundle locally:
```bash
npm install --legacy-peer-deps
npm run android:prepare
npx cap open android
```
