# Land BL — Land Bill of Lading app

Offline Windows desktop app for a customs broker office. Staff fill a Land Bill of Lading form,
the app assigns an incremental serial number, stores the document, and exports it to Excel and Word
from fixed templates, then prints it.

Read `docs/field-map.md` before touching forms, the database or exports.
Follow `docs/PLAN.md` phase by phase.

## Hard constraints

- **Fully offline.** No network calls at runtime, no CDNs, no Google Fonts, no telemetry, no auto-update.
  Fonts and all assets are bundled locally.
- **Single device for now.** SQLite file in `app.getPath('userData')`. Multi-device comes later,
  so keep serial generation isolated (see below).
- **Windows only.** Package with electron-builder (NSIS installer). Updates ship as a new installer.
- **Arabic RTL UI.** `<html dir="rtl" lang="ar">`. Labels come from `field-map.md` (Arabic first, English second).
- **Templates are read-only.** Never modify files in `templates/` at runtime. Load, fill a copy, save the copy.

## Stack

- Electron + electron-vite, React 18, TypeScript (strict)
- UI: Tailwind + shadcn/ui, RTL. Forms: react-hook-form + Zod
- shadcn registry components target React 19; this app is React 18. When adding one: wrap any
  component that receives a `ref` in `forwardRef` (React 18 drops `ref` props silently; Input and
  Button already are), and import `cn` from `@/lib/utils`, not the `cn` package the registry adds.
- Dates: `DateInput` (DD/MM/YYYY text + calendar). Calendar text uses `ar-SY-u-nu-latn`
  (`lib/calendar-format.ts`): Levantine month names, Latin digits. Plain `ar-SY` writes ٢٠٢٦.
- DB: better-sqlite3 + Drizzle ORM (migrations in `src/main/db/migrations`, generated with
  `npm run db:generate`, applied automatically on app start, shipped as extraResources).
  better-sqlite3 uses N-API prebuilds: no node-gyp rebuild for Electron. Check with `npm run check:native`.
- Excel: pizzip, editing `xl/worksheets/sheet1.xml` of `templates/land-bl.xlsx` directly
  (`services/export-excel.ts`). Not ExcelJS: it can't load this template (unprefixed drawing XML)
  and rounds 9.5 / 7.1 pt fonts. Text and dates are inline strings, numbers `<v>`, each cell keeps
  its `s` style. A test checks every other zip part stays byte-identical to the template.
- Word: docxtemplater + pizzip (fill `templates/land-bl.docx`, `linebreaks: true`, empty for missing).
  Every tag sits in an RTL run, so a line not starting with an Arabic letter is wrapped in LRM marks
  (`wordText` in `services/export-data.ts`, the Word equivalent of the print view's `dir="auto"`).
- Export values come from `exportSlots()` in `fields.ts` (printed fields, seal1..seal12, both agents).
  `npm test` writes sample exports to `test-output/` and prints their paths for a check in Office.
- Print / PDF: hidden BrowserWindow rendering the print view, `webContents.print()` / `printToPDF()`.
  The print view's layout is data in `src/renderer/src/components/print/print-layout.ts` (spans only,
  no cell addresses; a test checks positions against `fields.ts`).
- Document font stack: `Arial, "IBM Plex Sans Arabic", sans-serif` at the template's point sizes.
  Arial ships with Windows and is not bundled; Plex is the bundled fallback. Use the same stack when
  checking the Word template.
- Tests: Vitest (unit), Playwright for Electron (smoke). In unit tests `electron` is aliased to
  `src/main/test-electron.ts`, a stub that throws if a window or dialog is opened.
- History search: `search_text` column (normalised by `shared/search.ts`), `LIKE … ESCAPE '!'`.
- Lookups (parties, drivers, tankers): an exact duplicate (`nameKey`: case and spaces ignored) is
  refused with `LOOKUP_DUPLICATE`; a spelling variant (`findSimilar`, same folding as the search) is
  only warned about. Editing or deleting a lookup never changes saved documents.
- Backup: `services/backup.ts` (SQLite online backup API via better-sqlite3 `backup()`, never a file
  copy; `land-bl_<date>_<time>.sqlite`, newest 30 kept, safety backups `land-bl_before-restore_…` never
  rotated). Its config (folder, last backup, last error) is `userData/backup.json`, not the settings
  table, so a restore can't bring back an old folder or date. Automatic backup on startup (and hourly
  check) when the last is older than 24 h and there is at least one document.
- Restore: `services/restore.ts` copies the chosen file, checks it (integrity, app tables, not from a
  newer app version), migrates the copy, writes a safety backup, then swaps the DB file and restarts.
  `LAND_BL_NO_RELAUNCH=1` makes it exit without relaunching (e2e only).

## Licensing

See `docs/LICENSING.md`. Ed25519, offline, one license per PC (hash of the Windows MachineGuid).
- Checked in main before anything else (`src/main/index.ts`). Every IPC call goes through the gate
  (`license/gate.ts`): until the license is valid, only `license.*` answers, the rest returns
  `LICENSE_REQUIRED`, and the DB is not opened. A new IPC group needs nothing extra, but never
  register an `ipcMain` handler outside `registerIpc`.
- `userData/license.lic` and `license-state.json` (latest date seen) sit outside the DB: backup and
  restore never touch them. Clock more than 2 days behind that date, or the issue date: refused.
- Only the public key is in the app, compiled in by `electron.vite.config.ts`: the production key
  (`src/main/license/production-public-key.pem`), or the committed test key with `--mode e2e`.
  `build:win` refuses a build carrying the test key. The private key never enters the repo.
- `src/main/license/codec.ts` has no imports but `node:crypto`: the generator
  (`tools/license-generator`, Node type stripping) runs the same file. Keep it that way.
- e2e specs write a test license before launch (`installTestLicense` in `e2e/license.ts`).

## Architecture

```
src/
  main/        Electron main: DB, file system, exports, printing, IPC handlers
    db/        schema.ts, migrations/, client.ts
    services/  serial.ts, documents.ts, vessels.ts, settings.ts, lookups.ts, print.ts,
               backup.ts, restore.ts, backup-service.ts (Electron: dialogs, schedule, restart),
               export.ts (build), export-data.ts, export-excel.ts, export-word.ts,
               export-dialog.ts + save-file.ts (Electron: save dialog, write)
    license/   codec.ts (sign/verify), machine-id.ts, manager.ts (files), gate.ts (IPC gate),
               public-key.ts (build-time key)
    ipc.ts     one handler per service method, all through the license gate
  preload/     contextBridge exposing a typed `window.api`
  renderer/    React UI only. No Node, no fs, no DB access.
  shared/      fields.ts (from field-map.md), types, Zod schemas, IPC contract types
templates/     land-bl.xlsx, land-bl.docx (bundled as extraResources)
tools/         license-generator (developer only, never packaged)
```

Rules:
- Renderer talks to main only through the typed `window.api` (think of it as the app's API layer).
  `contextIsolation: true`, `nodeIntegration: false`.
- `src/shared/fields.ts` is the single source of truth for field keys, labels, types, Excel cells.
  No cell address or placeholder name may appear anywhere else.
- Validate with the same Zod schema in renderer (form) and main (before saving).

## Serial number

- The prefix is the **vessel's letter** (الباخرة), not a global setting. Each vessel has its own
  counter starting at 1. Format: `${vessel.prefix}${number padded to 5}` → `A00001`.
- Uniqueness is `(vessel_id, number)`, not the serial string: two vessels may share a letter.
  `serial_no` is stored as issued and never recomputed.
- Generated ONLY in `services/serial.ts`, inside the same SQLite transaction that inserts the document.
- Assigned on final save, not when the form opens, so abandoned forms never burn a number.
- Never reuse or renumber. Deleting is soft delete (`deleted_at`), the number stays taken.
- Documents are never edited after save. If editing is ever added, `search_text` must be rebuilt in
  the same transaction.
- Each document stores its own copy of the customs agent blocks (`customs_agent1/2`), taken from
  settings at save. Print, PDF, Excel and Word of a saved document use that copy, never the settings.
- A deleted document opens read-only; print, PDF, Excel and Word refuse it in main with
  `DOCUMENT_DELETED` (`getPrintableDocument`), not only in the UI.
- A vessel's letter is locked once it has documents.
- O and I are refused for a new or changed letter (they print like 0 and 1); vessels that already
  have one keep it. The set is `BLOCKED_PREFIXES` in `shared/schemas.ts`, awaiting client confirmation.
- A restore never lets a serial be issued twice: for a vessel with the same id and letter in both the
  backup and the current data, the restored counter keeps the higher number. The confirmation lists
  documents that will be removed and vessels created after the backup with their last serial.
- New documents default to the active vessel (`settings.activeVesselId`); the user can pick another
  active vessel in wizard step 1. `vesselId` is stored but not printed or exported.
- Inactive vessels can't receive new documents, but their existing documents still open, print,
  export and re-export normally. "Duplicate as new" uses the current active vessel, not the original.

## Domain glossary

| Term | Meaning |
|---|---|
| وثيقة نقل بري / Land BL | The document this app produces, one per tanker trip |
| رقم البوليصة | Document serial number |
| الجهة المرسلة / المرسل إليها | Shipper / consignee companies |
| طبيعي / قياسي | Natural vs standard (temperature-corrected) liters |
| معامل تصحيح الحجم (VCF) | Volume correction factor |
| الكثافة القياسية 15@ | Density at 15°C |
| الباخرة / Vessel | The ship whose cargo is moved; its letter prefixes the serial |
| الأختام | Seal numbers placed on the tanker, up to 12 |
| الصهريج | Tanker truck |
| رقم تسهيل المهمة | Mission facilitation number |
| الأمر التجهيزي | Supply order |
| المخلّص | Customs clearance agent |
| معبر التنف / معبر الوليد | Syrian / Iraqi border crossings |

## Commands

```
npm run dev        # start app in dev
npm run typecheck
npm run lint
npm test           # vitest
npm run test:e2e   # playwright electron smoke test
npm run db:generate   # new migration after editing src/main/db/schema.ts
npm run check:native  # load better-sqlite3 inside Electron
npm run build:win  # NSIS installer (checks the production license key first)
npm run license -- keygen|issue|inspect  # license generator, see docs/LICENSING.md
```

## How to work

- One phase from `docs/PLAN.md` per session. Plan first, wait for approval, then implement.
- Write tests first for services (serial, documents, exports).
- After each change: typecheck, lint, tests must pass before committing.
- For exports, verify by opening the generated file: logo present, merges intact, one A4 page.
- Small commits with clear messages. Update this file when a new rule or mistake appears twice.
- Ask before adding a dependency. Never add one that needs internet at runtime.

## Open questions (do not guess)

- Formulas linking natural/standard liters, weight and barrels. Until confirmed, all quantities are manual input.
- Date format confirmed? Default `DD/MM/YYYY`.
- Multi-device serial strategy (later): shared LAN DB vs prefix per device.
- Blocking O and I as vessel letters (done, see Serial number): to confirm with the client.
- Letter reuse across vessels: the schema allows two vessels with the same letter (serials would
  repeat, e.g. two `A00001`). Not confirmed by the client; don't add a uniqueness rule or warning yet.
