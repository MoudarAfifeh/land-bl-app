# Field map — Land Bill of Lading (وثيقة نقل بري)

Single source of truth. Every field has ONE key, used everywhere:
form field name, DB column (snake_case of the key), Excel cell, Word placeholder `{key}`.
Implement this as `src/shared/fields.ts` and derive the Zod schema, DB schema, form steps,
Excel writer and Word data from it. Never hardcode a cell address outside that file.

Excel template: `templates/land-bl.xlsx` (sheet `Sheet1`). For merged ranges, write to the top-left cell only.
Word template: `templates/land-bl.docx` (docxtemplater, default `{}` delimiters, `linebreaks: true`).

## Step 1 — Document & parties

| key | Label (AR / EN) | Type | Excel | Source |
|---|---|---|---|---|
| serialNo | رقم البوليصة / Serial No | string, e.g. `A00001` | C3 | Auto on save: vessel letter + number per vessel |
| vesselId | الباخرة / Vessel | ref, required | — (not printed) | Lookup: vessels. Default: active vessel |
| issueDate | تاريخ الإصدار / Date of Issue | date | C4 | Default: today, editable |
| shipperName | الجهة المرسلة / Shipper | string, required | C5 | Lookup: parties |
| shipperAddress | العنوان / Address | string | C6 | Auto-filled from party |
| consigneeName | المرسل إليها / Consignee | string, required | C7 | Lookup: parties |
| consigneeAddress | العنوان / Address | string | C8 | Auto-filled from party |

## Step 2 — Loading

| key | Label (AR / EN) | Type | Excel |
|---|---|---|---|
| product | نوع المنتج / Product | string, default `بنزين/ Gasoline` | G11 |
| qtyNaturalL | طبيعي (ليتر) / Natural (Liter) | number | A11 |
| qtyStandardL | قياسي (ليتر) / Standard (Liter) | number | A12 |
| weightKg | الوزن (كغ) / Weight (KG) | number | A13 |
| barrels | برميل / Barrel | number | A14 |
| seals | الأختام / Seals Numbers | string[] (max 12), exported as `seal1 … seal12` | see below |

Seal cells, in order: `A15, C15, E15, A16, C16, E16, A17, C17, E17, A18, C18, E18`.
In the DB store seals as a JSON array; expand to `seal1..seal12` only when exporting.

Quantity formulas are NOT confirmed yet. Do not auto-calculate until the client confirms them.

## Step 3 — Quality & supply officer

| key | Label (AR / EN) | Type | Excel |
|---|---|---|---|
| density15 | الكثافة القياسية 15@ / Density @15 | number | F20 |
| octane | الأوكتان / Octane | number | D20 |
| flashPoint | الوميض / Flash point | number | F22 |
| temperature | درجة الحرارة / Temp | number | D22 |
| vcf | معامل تصحيح الحجم / Volume correction factor | number | F23 |
| meterFactor | معامل العداد / Meter factor | number | D23 |
| crossingNo | رقم المنفذ / Crossing No | string | D24 |
| supplyOfficerName | موظف التجهيز / Supply officer | string | A20 |
| supplyOfficerTitle | المسمى الوظيفي / Job Title | string | A22 |

## Step 4 — Transportation

| key | Label (AR / EN) | Type | Excel | Source |
|---|---|---|---|---|
| missionNo | رقم تسهيل المهمة / Mission facilitation No | string | D27 | |
| supplyOrderNo | رقم الأمر التجهيزي / Supply order No | string | D28 | |
| supplyOrderDate | تاريخ الأمر التجهيزي / Supply order date | date | D29 | |
| tankerNo | رقم الصهريج / Tanker No | string, required | D30 | Lookup: tankers |
| driverName | اسم السائق / Driver Name | string, required | D31 | Lookup: drivers |
| passportNo | رقم جواز السفر / Passport No | string | D32 | Auto-filled from driver |
| carrierRep | ممثل الناقل / Carrier rep | string | E33 | |
| transportDate | التاريخ / Date | date | E34 | Default: issueDate |

## Settings (not per document)

| key | Meaning | Excel | Word |
|---|---|---|---|
| activeVesselId | Default vessel for new documents (must be an active vessel) | — | — |
| customsAgent1 | Syrian agent block (multi-line) | A27 | {customsAgent1} |
| customsAgent2 | Iraqi agent block (multi-line) | A30 | {customsAgent2} |

The Excel template already contains the current agent text. Overwrite A27/A30 from settings on export
so a settings change is reflected in new documents.

## Vessels (الباخرة)

The serial prefix belongs to the vessel, not to the app. Each vessel numbers its documents from 00001.

| key | Label (AR / EN) | Type |
|---|---|---|
| name | اسم الباخرة / Vessel name | string, required |
| prefix | حرف البوليصة / Serial letter | one Latin letter A–Z, required; locked once the vessel has documents |
| arrivalDate | تاريخ الوصول / Arrival date | date |
| isActive | نشطة / Active | boolean, default true |

- Uniqueness is (vessel, number). Two vessels may share a letter (not confirmed, see CLAUDE.md).
- Inactive vessels get no new documents; their existing documents still open, print and export.
- "Duplicate as new" uses the active vessel, not the original document's vessel.

## Out of scope for now

Discharging section (rows 35–47): printed blank, not stored.
Validity blanks in the footer (rows 48–50): left as `______`.

## Formats

Dates: `DD/MM/YYYY` in UI, Excel and Word. Store as ISO `YYYY-MM-DD`.
Numbers: stored as REAL, displayed without thousands separators unless the client asks.
