#!/usr/bin/env bash
set -euo pipefail
cd /app

npm ci
npm run appflow:prepare

chmod +x android/gradlew || true
cd android
exec ./gradlew assembleDebug --no-daemon --stacktrace
