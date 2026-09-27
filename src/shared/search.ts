/**
 * Search normalisation for the documents history. The same function runs on the stored
 * `search_text` and on the typed query, so spelling variants match: أحمد = احمد, شركة = شركه,
 * مصطفى = مصطفي, مُحَمَّد = محمد, ١٢٣ = 123, ABC = abc.
 */

/** The document fields the history search looks in. */
export const SEARCH_FIELDS = [
  'serialNo',
  'driverName',
  'tankerNo',
  'shipperName',
  'consigneeName'
] as const

export type SearchSource = Record<(typeof SEARCH_FIELDS)[number], string | null | undefined>

// Tashkeel (harakat, tanwin, shadda, sukun…), superscript alef, and tatweel.
const MARKS = /[\u064B-\u065F\u0670\u0640]/g

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFC')
    .replace(MARKS, '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // أ إ آ ٱ → ا
    .replace(/\u0649/g, '\u064A') // ى → ي
    .replace(/\u0629/g, '\u0647') // ة → ه
    .replace(/\u0624/g, '\u0648') // ؤ → و
    .replace(/\u0626/g, '\u064A') // ئ → ي
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** The words of a query; each must appear in the document for it to match. */
export function searchTokens(query: string): string[] {
  return normalizeSearch(query).split(' ').filter(Boolean)
}

/** What is stored in `search_text`: one normalised field per line, so a word can't span two. */
export function searchText(doc: SearchSource): string {
  return SEARCH_FIELDS.map((k) => normalizeSearch(doc[k] ?? ''))
    .filter(Boolean)
    .join('\n')
}

/** Escapes `%`, `_` and `!` for `LIKE … ESCAPE '!'` (no backslashes to double-escape). */
export function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, (c) => `!${c}`)
}
