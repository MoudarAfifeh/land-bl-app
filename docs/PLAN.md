# Build plan

Each phase = one Claude Code session. Start with the prompt, approve the plan, let it implement,
check the "Done when" list yourself, commit, then `/clear` before the next phase.

## Phase 0 — Project setup

Prompt:
> Read CLAUDE.md and docs/field-map.md. Scaffold the project with electron-vite (React + TS),
> Tailwind, shadcn/ui with RTL, ESLint, Prettier, Vitest. Set up contextIsolation and an empty typed
> `window.api`. Copy `templates/` as extraResources. Bundle an Arabic font locally (no CDN).
> Plan first, don't write code yet.

Done when: `npm run dev` opens an RTL window with Arabic text in the bundled font; typecheck, lint and test pass.

## Phase 1 — Fields and database

Prompt:
> Create `src/shared/fields.ts` from docs/field-map.md, and derive the Zod schema from it.
> Then set up better-sqlite3 + Drizzle with tables: documents, parties, drivers, tankers, settings, counters.
> Implement `services/serial.ts` exactly as CLAUDE.md describes, with tests for padding, prefix,
> sequential numbers and no reuse after soft delete. Plan first.

Done in Phase 1: the serial prefix became the vessel's letter (vessels table, one counter per vessel).

Done when: serial tests pass, DB file is created in userData, migrations run on start.

## Phase 2 — Form wizard

Prompt:
> Build the new-document wizard with 4 steps from field-map.md (parties, loading, quality, transport)
> plus a review step. react-hook-form + Zod, validate per step. Lookups for parties, drivers and tankers
> with autocomplete; choosing a driver fills the passport number; new values can be saved to the lookup.
> Seals: up to 12 inputs. Plan first.

Vessel (added in Phase 1): step 1 has a vessel select (active vessels only, defaults to the active vessel)
and a small "add vessel" dialog: name, letter, arrival date, "set as active". Uses `services/vessels.ts`.
Full vessel management stays in Phase 6.

Done when: you can fill all steps, errors show in Arabic next to fields, and save creates a document with a serial.
With no vessel yet, the dialog lets you create one and save works right after.

## Phase 3 — Print view and printing

Prompt:
> Build a print view React component that reproduces the template layout on one A4 page, RTL.
> Use it in the review step and for printing through a hidden BrowserWindow (print and save as PDF).

Done when: printed page matches the Excel template visually and fits one A4 page.

## Phase 4 — Excel and Word export

Prompt:
> Implement `export-excel.ts` (ExcelJS, fill a copy of templates/land-bl.xlsx using cells from fields.ts)
> and `export-word.ts` (docxtemplater on templates/land-bl.docx). Tests: generate both from a sample
> document and assert key cells / text. Let the user choose the save location. Plan first.

Done in Phase 4: ExcelJS could not load the template and rounded fractional font sizes, so Excel
is filled by editing the sheet XML with pizzip (see CLAUDE.md, Stack).

Done when: both files open in Office with all values in place. For Excel check the logo, merged cells and
one-page print survived. If ExcelJS drops the logo or print settings, stop and tell me before switching library.

## Phase 5 — History

Prompt:
> Build the documents history screen: table with search by serial, driver, tanker, shipper and date range.
> Actions: open, re-export Excel/Word, print, duplicate as new (copies everything except serial, dates,
> tanker, driver and seals), soft delete. Duplicate uses the active vessel, not the original's.
> Documents of inactive vessels open, print and re-export normally.

Done when: duplicate creates a new serial and old documents re-export identically, including documents
of inactive vessels.

## Phase 6 — Settings and backup

Prompt:
> Settings screen: vessels (CRUD, active vessel, activate/deactivate; letter locked once used),
> customs agents text, CRUD for parties, drivers, tankers.
> Backup: automatic daily copy of the SQLite file to a chosen folder (keep last 30), plus manual
> backup and restore with confirmation. Use SQLite's backup API, not a raw file copy while open.

Done when: restore from a backup brings back all documents and the next serial continues correctly.

## Phase 7 — Packaging

Prompt:
> Configure electron-builder for a Windows NSIS installer with app name, icon and Arabic product name.
> Make sure better-sqlite3 is rebuilt for Electron and templates are included. Add a Playwright
> smoke test: open app, create a document, export both files.

Done when: the installer works on a clean Windows machine with no internet.

## Later

- Multi-device serial (LAN server vs prefix per device)
- Discharging section
- Quantity auto-calculation once formulas are confirmed
- Merge into the larger port / customs broker system
