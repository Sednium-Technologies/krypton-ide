#!/usr/bin/env python3
"""
Python tool to update the app ID and all OBB and app data paths
to 'com.sednium.kryptonide.legacy' across krypton-ide and KryptonideWeb.
"""
import os
import sys

TARGET_APP_ID = "com.sednium.kryptonide.legacy"
OLD_APP_ID = "com.sednium.kryptonide.legacy"

ROOTS = [
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide",
    "/run/media/bhoid/StorageVault/WEbs/KryptonideWeb",
]

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "dist-apk",
    ".gradle",
    "build",
    ".cxx",
    "target",
    ".superpowers",
}

BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".webp", ".ico", ".keystore",
    ".jar", ".aar", ".so", ".bin", ".o", ".part", ".ai", ".zip"
}

# Explicit files that must be updated
TARGET_FILES = [
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/capacitor.config.json",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/android/app/src/main/assets/capacitor.config.json",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/android/app/build.gradle",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/android/app/src/main/res/values/strings.xml",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/android/app/google-services.json",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/android/app/src/main/cpp/pty_bridge.c",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/android/app/src/main/java/com/sednium/kryptonide/terminal/TermuxBootstrapInstaller.kt",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/lib/terminal/nativeTerminalBridge.ts",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/lib/terminal/toolScanner.ts",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/hooks/useTerminalScanner.ts",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/store/useNativeTerminalStore.ts",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/components/terminal/TermuxBootstrapModal.tsx",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/components/projects/PermissionConsentModal.tsx",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/src/lib/storagePermission.ts",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/AUDIT_REPORT.md",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/docs/AUDIT_REPORT.md",
    "/run/media/bhoid/StorageVault/WEbs/krypton-ide/docs/kryptonide.md",
    "/run/media/bhoid/StorageVault/WEbs/KryptonideWeb/src/data/pages.tsx",
    "/run/media/bhoid/StorageVault/WEbs/KryptonideWeb/src/data/compareRows.ts",
    "/run/media/bhoid/StorageVault/WEbs/KryptonideWeb/src/data/docs.tsx",
    "/run/media/bhoid/StorageVault/WEbs/KryptonideWeb/src/data/codePanels.ts",
    "/run/media/bhoid/StorageVault/WEbs/KryptonideWeb/scripts/smoke.mjs",
]

def patch_file(file_path):
    if not os.path.isfile(file_path):
        return False
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        orig = content
        
        # 1. Update app data paths (/data/data/com.sednium.kryptonide.legacy/ -> /data/data/com.sednium.kryptonide.legacy.legacy/)
        content = content.replace(f"/data/data/{OLD_APP_ID}", f"/data/data/{TARGET_APP_ID}")
        
        # 2. Update obb paths (/Android/obb/com.sednium.kryptonide.legacy.legacy.legacy -> /Android/obb/com.sednium.kryptonide.legacy.legacy.legacy.legacy)
        content = content.replace(f"/Android/obb/{OLD_APP_ID}", f"/Android/obb/{TARGET_APP_ID}")
        content = content.replace(f"Android/obb/{OLD_APP_ID}", f"Android/obb/{TARGET_APP_ID}")
        content = content.replace(f"/obb/{OLD_APP_ID}", f"/obb/{TARGET_APP_ID}")
        
        # 3. Update external app data paths (/Android/data/com.sednium.kryptonide.legacy.legacy -> /Android/data/com.sednium.kryptonide.legacy.legacy.legacy)
        content = content.replace(f"/Android/data/{OLD_APP_ID}", f"/Android/data/{TARGET_APP_ID}")
        content = content.replace(f"Android/data/{OLD_APP_ID}", f"Android/data/{TARGET_APP_ID}")

        # 4. Update package intent URIs
        content = content.replace(f"package:{OLD_APP_ID}", f"package:{TARGET_APP_ID}")

        # 5. Update build.gradle applicationId specifically (keep namespace as Java identifier)
        if file_path.endswith("build.gradle"):
            content = content.replace(f'applicationId "{OLD_APP_ID}"', f'applicationId "{TARGET_APP_ID}"')
            content = content.replace(f"applicationId '{OLD_APP_ID}'", f"applicationId '{TARGET_APP_ID}'")
        # 6. Update capacitor configs (appId)
        elif file_path.endswith("capacitor.config.json"):
            content = content.replace(f'"{OLD_APP_ID}"', f'"{TARGET_APP_ID}"')
        # 7. Update strings.xml (package_name, custom_url_scheme)
        elif file_path.endswith("strings.xml"):
            content = content.replace(f'>{OLD_APP_ID}<', f'>{TARGET_APP_ID}<')
        # 8. Update google-services.json
        elif file_path.endswith("google-services.json"):
            content = content.replace(f'"{OLD_APP_ID}"', f'"{TARGET_APP_ID}"')
        # 9. General source files
        else:
            # Avoid replacing Java package declaration 'package com.sednium.kryptonide;'
            # but replace quotes, strings, mentions of the old app id
            content = content.replace(f'"{OLD_APP_ID}"', f'"{TARGET_APP_ID}"')
            content = content.replace(f"'{OLD_APP_ID}'", f"'{TARGET_APP_ID}'")
            content = content.replace(f'`{OLD_APP_ID}`', f'`{TARGET_APP_ID}`')
            content = content.replace(f'({OLD_APP_ID})', f'({TARGET_APP_ID})')
            content = content.replace(f'code>{OLD_APP_ID}<', f'code>{TARGET_APP_ID}<')
            content = content.replace(f'strong>{OLD_APP_ID}<', f'strong>{TARGET_APP_ID}<')

        if content != orig:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[UPDATED] {file_path}")
            return True
        else:
            print(f"[UNCHANGED] {file_path}")
            return False
    except Exception as e:
        print(f"[ERROR] {file_path}: {e}")
        return False

def scan_and_patch_all():
    print(f"=== Migrating App to {TARGET_APP_ID} ===")
    
    # Run through explicit target files first
    patched_count = 0
    for tf in TARGET_FILES:
        if patch_file(tf):
            patched_count += 1

    # Scan the rest of the roots
    for root_path in ROOTS:
        for root, dirs, files in os.walk(root_path):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in BINARY_EXTS:
                    continue
                file_path = os.path.join(root, f)
                if file_path in TARGET_FILES:
                    continue
                # Check if it has OLD_APP_ID
                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as fp:
                        txt = fp.read()
                    if f"/data/data/{OLD_APP_ID}" in txt or f"package:{OLD_APP_ID}" in txt or f"/obb/{OLD_APP_ID}" in txt:
                        if patch_file(file_path):
                            patched_count += 1
                except Exception:
                    pass

    print(f"\nMigration Complete! Total files updated: {patched_count}")

if __name__ == "__main__":
    scan_and_patch_all()
