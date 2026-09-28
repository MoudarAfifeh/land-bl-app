/**
 * The app's log file, for support: `userData/logs/main.log`, rotated to main.1.log and main.2.log
 * at MAX_BYTES, so the folder never holds more than about 3 MB. The client sends the folder when
 * something goes wrong (Settings → حول البرنامج → فتح مجلد السجلات).
 *
 * Errors only, plus a startup line: never document contents. No Electron here, so tests call it
 * directly; index.ts wires Electron's events to it.
 */
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'

export const LOGS_FOLDER = 'logs'
export const LOG_FILE = 'main.log'
const MAX_BYTES = 1024 * 1024
/** main.log plus this many rotated files. */
const ROTATED = 2
/** One entry never fills the file on its own (a huge object dumped by mistake). */
const MAX_ENTRY = 16 * 1024

export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export interface Log {
  folder: string
  write(level: LogLevel, ...args: unknown[]): void
}

export interface LogOptions {
  /** The logs folder, created if missing. */
  folder: string
  maxBytes?: number
  now?: () => Date
}

/** Local time with its offset, as the client's clock shows it: 2026-09-28 14:03:07.120 +02:00. */
function timestamp(d: Date): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} ` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  )
}

export function createLog(options: LogOptions): Log {
  const { folder } = options
  const maxBytes = options.maxBytes ?? MAX_BYTES
  const now = options.now ?? (() => new Date())
  const file = join(folder, LOG_FILE)
  const rotated = (n: number): string => join(folder, `main.${n}.log`)

  let size: number | null = null
  const currentSize = (): number => {
    if (size === null) {
      try {
        size = statSync(file).size
      } catch {
        size = 0
      }
    }
    return size
  }

  function rotate(): void {
    rmSync(rotated(ROTATED), { force: true })
    for (let n = ROTATED - 1; n >= 1; n--) {
      try {
        renameSync(rotated(n), rotated(n + 1))
      } catch {
        // not there yet
      }
    }
    renameSync(file, rotated(1))
    size = 0
  }

  return {
    folder,
    write(level, ...args) {
      let message = format(...args)
      if (message.length > MAX_ENTRY) message = `${message.slice(0, MAX_ENTRY)} … [truncated]`
      const entry = `${timestamp(now())} ${level} ${message}\r\n`
      const bytes = Buffer.byteLength(entry)
      // Logging must never be the thing that breaks the app: a failed write is dropped.
      try {
        mkdirSync(folder, { recursive: true })
        if (currentSize() > 0 && currentSize() + bytes > maxBytes) rotate()
        appendFileSync(file, entry, 'utf8')
        size = currentSize() + bytes
      } catch {
        size = null
      }
    }
  }
}

/**
 * Sends main's console.error / console.warn to the log too (they still print in dev), and logs
 * uncaught errors. An uncaught exception is shown like Electron's default does, then the app goes on.
 */
export function captureMainErrors(log: Log, showError: (message: string) => void): void {
  const { error, warn } = console
  console.error = (...args: unknown[]) => {
    error(...args)
    log.write('ERROR', ...args)
  }
  console.warn = (...args: unknown[]) => {
    warn(...args)
    log.write('WARN', ...args)
  }
  process.on('uncaughtException', (err) => {
    error(err)
    log.write('ERROR', 'Uncaught exception:', err)
    showError(err instanceof Error ? (err.stack ?? err.message) : String(err))
  })
  process.on('unhandledRejection', (reason) => {
    error(reason)
    log.write('ERROR', 'Unhandled rejection:', reason)
  })
}
