# Release

How to build the Windows installer, bump the version, check a build, and install it on a client PC.
Staff instructions (Arabic) are in `docs/USER-GUIDE.md`; licenses in `docs/LICENSING.md`.

## What gets built

| | |
|---|---|
| Installer | `dist/land-bl-setup-<version>.exe`, Windows x64, about 105 MB |
| Installs to | `%LOCALAPPDATA%\Programs\land-bl\land-bl.exe`, per user, **no admin rights** |
| Shortcuts | Desktop and Start menu, named «وثيقة نقل بري» |
| Data (userData) | `%APPDATA%\land-bl`: `land-bl.sqlite`, `license.lic`, `license-state.json`, `backup.json`, `logs\` |
| Backups | The folder chosen in Settings (default `Documents\LandBL-Backups`) |

The installer is one-click: no wizard, it installs, creates the shortcuts and starts the app.
It has no auto-update and makes no network access. Updates are a new installer.

## Prerequisites (developer PC)

- Windows 10/11 x64, Node 22 (22.17 used for 1.0.0), `npm ci` done.
- `src/main/license/production-public-key.pem` committed (see `docs/LICENSING.md`).
- **Internet for the first build only**: electron-builder downloads Electron and NSIS into
  `%LOCALAPPDATA%\electron\Cache` and `%LOCALAPPDATA%\electron-builder\Cache`. Later builds reuse
  the cache. The app itself never goes online.

## 1. Bump the version

The version in `package.json` is the one in the installer name, in the exe, and in Settings →
حول البرنامج. Use npm, which updates `package.json` and `package-lock.json`, commits and tags:

```
npm version patch     # 1.0.0 → 1.0.1: fixes
npm version minor     # 1.0.1 → 1.1.0: new features
npm version major     # 1.1.0 → 2.0.0: big changes
```

A database schema change (a new migration) is fine in any bump: the app migrates on start. But
**never ship a lower version** than a client already has: an older app doesn't know the newer
database's changes (nothing stops it from opening it), and restore refuses backups from a newer
version.

## 2. Run the tests

```
npm run typecheck
npm run lint
npm test               # unit tests
npm run test:e2e       # Electron tests, from the build (test license key)
npm run test:packaged  # the packaged app (see below)
```

`test:packaged` builds with the **test** license key into `dist-e2e/win-unpacked` (never an
installer), then launches that exe: activates through the activation screen, creates a vessel and a
document, saves a PDF, exports Excel and Word, backs up, and checks every file and the log. It
proves what only packaging can break: better-sqlite3 in `app.asar.unpacked`, templates and
migrations from `process.resourcesPath`, the bundled UI and fonts. `dist-e2e/` is ignored by git
and must never be given to anyone: anyone can make licenses for it.

## 3. Build the installer

```
npm run build:win
```

It stops at the first failed step:

1. `check:native`: loads better-sqlite3 inside this Electron. It uses N-API prebuilds, which work
   in any Electron version, so it is **not** rebuilt (a rebuild would need Python and MSVC).
2. `electron-vite build`: production license key compiled in.
3. `scripts/check-license-key.mjs`: the build has the production key, not the test key.
4. `scripts/check-offline.mjs`: no URL in main or preload; the only URLs in the renderer are the
   reviewed ones listed in the script (XML namespaces, text of library error messages), and the
   Content-Security-Policy refuses every remote request. A new URL fails the build: remove it or
   add it to the list with the reason it is never fetched.
5. `electron-builder --win`, then `scripts/after-pack.mjs` on the packaged files, before the
   installer is made: no `tools/`, `e2e/`, `src/`, keys, licenses or `issued-licenses.csv` inside
   `app.asar`; templates, migrations and the better-sqlite3 prebuild present; the offline check
   again on the packaged bundles; the test key only ever in a `dist-e2e` folder build.

Don't call `electron-builder` directly: it would skip steps 1–4.

After the build, commit and push the tag from step 1 (`git push --follow-tags`). Keep a copy of each
installer you ship, with its version, next to your license keys backup.

## 4. Check the installer on a clean machine (Windows Sandbox)

Windows Sandbox (Windows 11 Pro) is a clean, throwaway Windows: the right place to check the
installer offline, as a client PC would run it.

1. Once: *Turn Windows features on or off* → **Windows Sandbox**, then restart.
2. Save this as `land-bl-test.wsb` (adjust the path) and double-click it:

   ```xml
   <Configuration>
     <Networking>Disable</Networking>
     <MappedFolders>
       <MappedFolder>
         <HostFolder>C:\Users\User\Desktop\Port\land-bl-app\dist</HostFolder>
         <SandboxFolder>C:\installer</SandboxFolder>
         <ReadOnly>true</ReadOnly>
       </MappedFolder>
     </MappedFolders>
   </Configuration>
   ```

3. In the sandbox, copy `C:\installer\land-bl-setup-<version>.exe` to the desktop and run it.
4. Check:
   - no admin prompt; the app starts; desktop and Start menu shortcuts are «وثيقة نقل بري» with the
     UCC icon;
   - the activation screen shows a machine code and the version. The sandbox has its own machine
     code, so issue a short license for it:
     `npm run license -- issue ... --machine <code> --customer "Sandbox test" --expires <tomorrow> --note "release check <version>"`,
     then paste it;
   - create a vessel and a document, print preview, save a PDF, export Excel and Word and open
     them in the sandbox if Office is there, otherwise copy them out;
   - Settings → النسخ الاحتياطي: back up now; Settings → حول البرنامج → فتح مجلد السجلات opens
     `%APPDATA%\land-bl\logs`;
   - uninstall from *Settings → Apps*: `%APPDATA%\land-bl` is still there; reinstall: the app opens
     with the same license and documents.
5. Closing the sandbox discards everything.

What Windows says about the unsigned installer in the sandbox is what a client will see (see Code
signing below).

## 5. Install on a client PC

1. Copy the installer on a USB stick (a file downloaded from the internet or email is more likely to
   trigger SmartScreen).
2. Close the app if an older version is running, then run the installer. If Windows shows
   *"Windows protected your PC"*: **More info → Run anyway**.
3. The app opens on the activation screen. Send yourself the machine code (the copy button), issue
   the license (`docs/LICENSING.md`), paste it, **تفعيل**.
4. First setup, in Settings:
   - **النسخ الاحتياطي**: choose a backup folder on a USB drive or another disk, then
     **نسخ احتياطي الآن**. The app warns when the folder is on the same disk as its data.
   - **البواخر**: add the vessel and make it current. **المخلّصون**: the customs agents text.
5. Print one document on the office printer and check it fits one A4 page.

## Updating a client

Run the new installer on the client PC (close the app first). It replaces the program and keeps
everything in `%APPDATA%\land-bl`: documents, license, backup settings and logs. The database is
migrated on first start. A backup before updating costs nothing: Settings → النسخ الاحتياطي →
نسخ احتياطي الآن.

## Uninstalling

*Settings → Apps → وثيقة نقل بري → Uninstall* removes the program and shortcuts only. The
database, license, backup settings and logs stay in `%APPDATA%\land-bl`, and backups stay in their
folder, so a reinstall continues where it stopped.

To remove the data too, back it up first, then delete `%APPDATA%\land-bl` by hand. (The uninstaller
would also delete it if run with `--delete-app-data`: never use that flag.)

## Support: logs

Errors are written to `%APPDATA%\land-bl\logs\main.log` (rotated at 1 MB, three files at most:
`main.log`, `main.1.log`, `main.2.log`). The client opens the folder with **فتح مجلد السجلات**,
in Settings → حول البرنامج or at the bottom of the activation screen, and sends the files. They
contain errors and a startup line (version, Windows version), never document contents.

## Data folder before 1.0.0

Builds before 1.0.0 kept their data in `%APPDATA%\land-bl-app` (named after `package.json`). On the
first start without `%APPDATA%\land-bl`, the app copies its files from there (database and its
side files, `backup.json`, license and license state; not Chromium's caches) and logs what it
copied. The old folder is left as it was; delete it by hand once 1.0.0 has run fine for a while.

## Code signing

The installer and the app are **not signed**. Nothing is bought or configured yet.

What an unsigned app means on Windows:

- **SmartScreen**: an installer that came from the internet or email ("Mark of the Web") shows
  *"Windows protected your PC … Unknown publisher"*; the user clicks **More info → Run anyway**. A
  copy from a USB stick usually has no such mark and shows nothing.
- **No admin prompt** in either case: the install is per user.
- **Antivirus**: unsigned Electron apps and NSIS installers get more false positives.
- **Smart App Control** (Windows 11, only on a *fresh* install where it was left on): it may block
  unsigned apps outright, with no "Run anyway". It can be turned off, but not back on without
  reinstalling Windows. The sandbox check shows whether a clean PC blocks it.
- It repeats for every new installer: each version is a new unsigned file.

Options, if it becomes a problem:

1. **Stay unsigned**: deliver by USB, tell staff about *Run anyway*. Free; fine for a few known PCs.
2. **OV code signing certificate** (roughly $200–400 a year). Since 2023 the key must live on a
   hardware token or a cloud HSM. Shows your name as publisher, reduces antivirus flags and
   satisfies Smart App Control. SmartScreen warnings fade only as the app gains download
   reputation, which is slow with few installs.
3. **EV certificate**: more expensive and needs a registered company. Since 2024 it no longer
   skips SmartScreen instantly, so for this app it adds little over OV.
4. **Microsoft Trusted Signing** (a monthly subscription, cloud signing): the cheapest real
   signature, but identity validation limits it to some countries and organisation types. Check
   the signing entity's eligibility first.

Signing needs the internet only while building (the timestamp server). electron-builder supports
all of these through `electron-builder.yml` (`win.signtoolOptions` or `win.azureSignOptions`).
Signing also makes patching the app (a limit noted in `docs/LICENSING.md`) somewhat harder.
