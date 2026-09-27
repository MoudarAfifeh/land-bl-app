import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Docxtemplater from 'docxtemplater'
import InspectModule from 'docxtemplater/js/inspect-module.js'
import PizZip from 'pizzip'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DocumentView } from '@shared/api'
import { documentFields, SEAL_KEYS } from '@shared/fields'
import { exportCells, wordData } from './export-data'
import { fillDocument } from './export-word'
import { longDocument, sampleDocument } from './test-fixtures'
import { saveTestOutput } from './test-output'
import { child, children, parseXml, type XmlNode } from './test-xlsx'

const template = readFileSync(resolve('templates/land-bl.docx'))
const LRM = '\u200E'

const agents = {
  customsAgent1: 'المخلص السوري/ معبر التنف\nشركة الحسن/ عمر سفيان\n00963-933-351758',
  customsAgent2: 'المخلص العراقي / معبر الوليد\nبشار أبو حسن\n00964-772-3247959'
}

const longView: DocumentView = { ...longDocument, vesselId: 1, id: 1, serialNo: 'T00001' }

function render(view: DocumentView, a: typeof agents | Record<string, null> = agents): Buffer {
  return fillDocument(template, wordData(exportCells(view, a as typeof agents)))
}

const documentXml = (docx: Buffer): string => new PizZip(docx).file('word/document.xml')!.asText()

/** Every run of the body: its text pieces and whether it is marked right-to-left. */
function runs(docx: Buffer): { texts: string[]; rtl: boolean; breaks: number }[] {
  const out: { texts: string[]; rtl: boolean; breaks: number }[] = []
  const walk = (n: XmlNode): void => {
    if (n.name === 'r') {
      out.push({
        texts: children(n, 't').map((t) => t.text),
        rtl: child(child(n, 'rPr'), 'rtl') !== undefined,
        breaks: children(n, 'br').length
      })
    } else n.children.forEach(walk)
  }
  walk(parseXml(documentXml(docx)))
  return out
}

/** The text of the whole body, one line per paragraph, line breaks as \n. */
function plainText(docx: Buffer): string {
  return documentXml(docx)
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

let output: Buffer

beforeAll(() => {
  output = render(longView)
  saveTestOutput('long-12-seals.docx', output)
})

describe('Word template tags', () => {
  it('has exactly the printable keys, seal1..seal12 and both agents: none missing, none extra', () => {
    const inspect = new InspectModule()
    new Docxtemplater(new PizZip(template), {
      paragraphLoop: true,
      linebreaks: true,
      modules: [inspect]
    })
    const tags = Object.keys(inspect.getAllTags()).sort()
    const printable = documentFields.filter((f) => f.print && f.key !== 'seals').map((f) => f.key)
    expect(tags).toEqual([...printable, ...SEAL_KEYS, 'customsAgent1', 'customsAgent2'].sort())
  })
})

describe('the filled document', () => {
  it('contains the key values', () => {
    const text = plainText(output).replaceAll(LRM, '')
    for (const v of [
      'T00001',
      '27/09/2026',
      '20/09/2026',
      longDocument.shipperName,
      longDocument.consigneeName,
      longDocument.driverName,
      longDocument.tankerNo,
      longDocument.passportNo!,
      '36123.456',
      '-43',
      ...longDocument.seals
    ]) {
      expect(text, v).toContain(v)
    }
  })

  it('leaves no placeholder and never prints "undefined" or "null", even when sparse', () => {
    const sparse = render(
      { ...sampleDocument(1, { seals: [], qtyNaturalL: null }), id: 2, serialNo: 'A00002' },
      { customsAgent1: null, customsAgent2: null }
    )
    saveTestOutput('sparse.docx', sparse)
    for (const doc of [output, sparse]) {
      const text = plainText(doc)
      expect(text).not.toMatch(/undefined|null|NaN/)
      expect(text).not.toMatch(/[{}]/)
    }
  })

  it('turns agent line breaks into Word line breaks, each line keeping the cell format', () => {
    // docxtemplater writes one run per line with a bare <w:br/> run between them; the template's
    // default run format is the same Arial 8pt, so the breaks don't change the line height.
    const all = runs(output)
    const first = all.findIndex((r) => r.texts[0]?.startsWith('المخلص السوري'))
    const paragraph = all.slice(first, first + 5)
    expect(paragraph.map((r) => (r.breaks ? '<br>' : r.texts.join('')))).toEqual([
      'المخلص السوري/ معبر التنف',
      '<br>',
      'شركة الحسن/ عمر سفيان',
      '<br>',
      `${LRM}00963-933-351758${LRM}`
    ])
    expect(paragraph.filter((r) => !r.breaks).every((r) => r.rtl)).toBe(true)
    const styles = new PizZip(template).file('word/styles.xml')!.asText()
    expect(styles).toMatch(/<w:rPrDefault><w:rPr>.*<w:sz w:val="16"\/>/)
  })

  it('escapes special characters', () => {
    const tricky = `شركة "الأمل" & أولاده <فرع 2> 'دمشق'`
    const doc = render({ ...sampleDocument(1, { shipperName: tricky }), id: 3, serialNo: 'A00003' })
    expect(plainText(doc)).toContain(tricky)
    expect(() => parseXml(documentXml(doc))).not.toThrow()
  })
})

describe('left-to-right values inside RTL cells', () => {
  /** The run holding a value: the text must sit whole in one run, in typed order. */
  const runWith = (value: string): { texts: string[]; rtl: boolean } | undefined =>
    runs(output).find((r) => r.texts.some((t) => t.replaceAll(LRM, '') === value))

  it('keeps seal codes, numbers and dates whole and in order, isolated with LRM marks', () => {
    for (const value of [
      ...longDocument.seals,
      '36123.456',
      '0.7456',
      '-43',
      '27/09/2026',
      'CR-2026-000123456',
      'MF-2026/000123456/IRQ-SYR',
      'A12345678 / N98765432'
    ]) {
      const run = runWith(value)
      expect(run, value).toBeDefined()
      // The cell is RTL; the LRM marks make the value's own direction left to right.
      expect(run!.rtl, value).toBe(true)
      expect(run!.texts, value).toEqual([`${LRM}${value}${LRM}`])
    }
  })

  it('leaves Arabic-first values without marks', () => {
    for (const value of [longDocument.shipperName, longDocument.tankerNo]) {
      expect(runWith(value)!.texts).toEqual([value])
    }
  })

  it('keeps Latin-first names left to right', () => {
    expect(runWith(longDocument.consigneeName)!.texts).toEqual([
      `${LRM}${longDocument.consigneeName}${LRM}`
    ])
  })
})
