# Kryptonide Settings Features Ledger (features.md)

Comprehensive list of all features, capabilities, and configuration options supported in Kryptonide Settings.

---

## 1. Accounts & Authentication
- **GitHub Integration**:
  - Primary OAuth Device Flow login (`github.com/login/device`) with one-tap code copying.
  - Personal Access Token (`ghp_...`) fallback.
  - Profile badge: avatar, display name, handle (`@username`), public repository count.
  - Account disconnection.
- **Google Account Integration**:
  - Google OAuth / Firebase native sign-in.
  - Profile badge: user avatar/initial, display name, email.
  - Silent token refresh mechanism (`signInWithGoogle` background scope refresh).
  - Sign out / disconnect action.

---

## 2. Storage & System Paths
- Display active local storage path (`/storage/emulated/0/KryptonIDE/`).
- External file manager guidance (ZArchiver, Files, Material Files).

---

## 3. Project Import & Export
- **Export .zip**: Package active workspace files into a standard `.zip` archive.
- **Import .zip**: Extract and load external `.zip` archives into the active workspace.

---

## 4. Appearance & Dynamic Themes
- **Theme Selection**:
  - Charcoal / Dark (`krypton-warm` / `vs-dark`)
  - Ivory / Light (`light`)
  - High Contrast (`hc-black`)
- **Dynamic Theme Reactivity**:
  - Instant HTML class & `data-theme` attribute toggling.
  - Automatic status bar & navigation bar theme color updates.

---

## 5. Typography & Custom Fonts
- Custom font file upload (`.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`).
- Dynamic `@font-face` DOM injection.
- Font selector dropdown with active font indicator.
- Individual font deletion and "Reset to Default" (JetBrains Mono).

---

## 6. Cloud Backup & Sync (Google Drive AppData)
- Last cloud sync timestamp display.
- One-tap "Backup to Google Drive" (`syncUpToDrive`).
- One-tap "Restore from Google Drive" (`syncDownFromDrive`) with confirmation gate.
- Manual Auth Token Refresh helper button.

---

## 7. Haptics & Feedback
- Global Haptics toggle (`isHapticsEnabled` via Capacitor Haptics).

---

## 8. Application Data Reset
- "Clear All Data" action with safety prompt to purge `localStorage` and reset application state.

---

## 9. About & Metadata
- Version badge (`Kryptonide v4.0`).
- Author link (`CoderBhoid`).
- Website links (`sednium.com`, `kryptonide.sednium.com`).
- Stack highlights (TypeScript 7, OPFS, React 19).
