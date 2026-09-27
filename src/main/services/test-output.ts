import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Saves a generated file to test-output/ for a manual check; the run prints its path. */
export function saveTestOutput(name: string, data: Uint8Array): string {
  const dir = resolve('test-output')
  mkdirSync(dir, { recursive: true })
  const path = resolve(dir, name)
  writeFileSync(path, data)
  return path
}
