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
- DB: better-sqlite3 + Drizzle ORM (migrations in `src/main/db/migrations`)
- Excel: ExcelJS (fill `templates/land-bl.xlsx`)
- Word: docxtemplater + pizzip (fill `templates/land-bl.docx`, `linebreaks: true`)
- Print / PDF: hidden BrowserWindow rendering the print view, `webContents.print()` / `printToPDF()`
- Tests: Vitest (unit), Playwright for Electron (smoke)

## Architecture

```
src/
  main/        Electron main: DB, file system, exports, printing, IPC handlers
    db/        schema.ts, migrations/, client.ts
    services/  serial.ts, documents.ts, lookups.ts, export-excel.ts, export-word.ts, backup.ts
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

- Format: `${prefix}${number padded to 5}` → `A00001`. Prefix comes from settings.
- Generated ONLY in `services/serial.ts`, inside the same SQLite transaction that inserts the document.
- Assigned on final save, not when the form opens, so abandoned forms never burn a number.
- Never reuse or renumber. Deleting is soft delete (`deleted_at`), the number stays taken.

## Domain glossary

| Term | Meaning |
|---|---|
| وثيقة نقل بري / Land BL | The document this app produces, one per tanker trip |
| رقم البوليصة | Document serial number |
| الجهة المرسلة / المرسل إليها | Shipper / consignee companies |
| طبيعي / قياسي | Natural vs standard (temperature-corrected) liters |
| معامل تصحيح الحجم (VCF) | Volume correction factor |
| الكثافة القياسية 15@ | Density at 15°C |
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
