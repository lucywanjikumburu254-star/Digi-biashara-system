# Digi Biashara Android wrapper

This Android shell opens the live Digi Biashara production login at:

https://digi-biashara-fresh.vercel.app/login

It uses the existing web application, Supabase authentication, tenant data and business features. It does not create a separate database or duplicate the business system. An internet connection is required.

## Build

The GitHub Actions workflow builds an installable debug APK and uploads it as a downloadable workflow artifact. This is an internal/testing APK, not a Play Store release. A permanent release-signing key is required before producing customer update APKs that can upgrade one another without uninstalling.

The wrapper intentionally opens `/login`; the older `/open` path returns 404 on the current production app.
