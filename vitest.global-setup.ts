/**
 * Clears test-output/ before the run and prints the full path of every file the tests left
 * there, so the Excel and Word samples can be opened directly in Office.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const TEST_OUTPUT_DIR = resolve('test-output')

export default function setup(): () => void {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true })
  return () => {
    if (!existsSync(TEST_OUTPUT_DIR)) return
    const files = readdirSync(TEST_OUTPUT_DIR).sort()
    if (files.length === 0) return
    console.log(`\nFiles to check in Office (${TEST_OUTPUT_DIR}):`)
    for (const name of files) console.log(`  ${resolve(TEST_OUTPUT_DIR, name)}`)
  }
}
