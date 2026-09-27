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
- Tests: Vitest (unit), Playwright for Electron (smoke)

## Architecture

```
src/
  main/        Electron main: DB, file system, exports, printing, IPC handlers
    db/        schema.ts, migrations/, client.ts
    services/  serial.ts, documents.ts, vessels.ts, settings.ts, lookups.ts, print.ts, backup.ts,
               export.ts (build), export-data.ts, export-excel.ts, export-word.ts,
               export-dialog.ts + save-file.ts (Electron: save dialog, write)
    ipc.ts     one handler per service method
  preload/     contextBridge exposing a typed `window.api`
  renderer/    React UI only. No Node, no fs, no DB access.
  shared/      fields.ts (from field-map.md), types, Zod schemas, IPC contract types
templates/     land-bl.xlsx, land-bl.docx (bundled as extraResources)
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
- A vessel's letter is locked once it has documents.
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
npm run build:win  # NSIS installer
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
- Letter reuse across vessels: the schema allows two vessels with the same letter (serials would
  repeat, e.g. two `A00001`). Not confirmed by the client; don't add a uniqueness rule or warning yet.
