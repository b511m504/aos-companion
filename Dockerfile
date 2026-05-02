# Toolchain image for Android debug APK (no local Android Studio / Gradle install).
#
# Build image:
#   docker build -t aos-apk .
#
# Build APK (mount project root so outputs land on the host):
#   docker run --rm -v "${PWD}:/app" -w /app aos-apk
#
# Windows CMD:
#   docker run --rm -v "%cd%:/app" -w /app aos-apk
#
# APK path after success:
#   android/app/build/outputs/apk/debug/app-debug.apk

FROM eclipse-temurin:21-jdk-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=${ANDROID_HOME}
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools"

RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && curl -fsSL -o /tmp/cmdline-tools.zip \
        "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
    && unzip -q /tmp/cmdline-tools.zip -d /tmp \
    && mv /tmp/cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm -f /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses >/dev/null 2>&1 || true
RUN sdkmanager --install "platform-tools" "platforms;android-36" \
    && (sdkmanager --install "build-tools;36.1.0" \
        || sdkmanager --install "build-tools;36.0.0" \
        || sdkmanager --install "build-tools;35.0.1")

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
