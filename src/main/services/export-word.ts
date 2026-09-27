/**
 * Word export: fills a copy of templates/land-bl.docx with docxtemplater. Every placeholder
 * `{key}` is an export slot of fields.ts; multi-line values become line breaks.
 */
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

export function fillDocument(template: Uint8Array, data: Record<string, string>): Buffer {
  const doc = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true,
    linebreaks: true,
    // A missing value renders as empty, never as "undefined".
    nullGetter: () => ''
  })
  doc.render(data)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
