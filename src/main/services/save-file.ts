/** The save dialog and the final write, shared by PDF, Excel and Word. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import { ServiceError, type ErrorCode } from '@shared/errors'

/** Asks where to save, starting in Documents with `defaultName`; null if cancelled. */
export async function askSavePath(
  owner: BrowserWindow | null,
  options: { title: string; defaultName: string; filter: { name: string; extensions: string[] } }
): Promise<string | null> {
  const dialogOptions = {
    title: options.title,
    defaultPath: join(app.getPath('documents'), options.defaultName),
    filters: [options.filter]
  }
  const choice = owner
    ? await dialog.showSaveDialog(owner, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)
  return choice.canceled || !choice.filePath ? null : choice.filePath
}

/**
 * The error to report when producing or writing a file failed: FILE_IN_USE when Windows refuses
 * the write because the file is open (in Excel, Word or a PDF reader), otherwise `failure`.
 */
export function serviceErrorOf(error: unknown, failure: ErrorCode): ServiceError {
  if (error instanceof ServiceError) return error
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'EBUSY') return new ServiceError('FILE_IN_USE')
  console.error(error)
  return new ServiceError(failure)
}

export async function writeOutput(
  path: string,
  data: Uint8Array,
  failure: ErrorCode
): Promise<void> {
  try {
    await writeFile(path, data)
  } catch (error) {
    throw serviceErrorOf(error, failure)
  }
}
