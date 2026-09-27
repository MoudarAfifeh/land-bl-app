/** Excel and Word export for the UI: asks where to save, then builds and writes the file. */
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import type { Api, ExportFormat } from '@shared/api'
import type { Db } from '../db/client'
import { getPrintableDocument } from './documents'
import { buildExport, exportFormats } from './export'
import { askSavePath, serviceErrorOf, writeOutput } from './save-file'

/** Templates ship as extraResources when packaged; in dev they're read from the project. */
function templatesFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(app.getAppPath(), 'templates')
}

export function createExportService(db: Db, parent: () => BrowserWindow | null): Api['export'] {
  async function run(id: number, format: ExportFormat): Promise<{ path: string } | null> {
    const { serialNo } = getPrintableDocument(db, id) // NOT_FOUND / DELETED before the dialog
    const { extension, filter, failure } = exportFormats[format]
    const path = await askSavePath(parent(), {
      title: `تصدير ${filter}`,
      defaultName: `${serialNo}.${extension}`,
      filter: { name: filter, extensions: [extension] }
    })
    if (!path) return null

    let data: Buffer
    try {
      data = (await buildExport(db, id, format, templatesFolder())).data
    } catch (error) {
      throw serviceErrorOf(error, failure)
    }
    await writeOutput(path, data, failure)
    return { path }
  }

  return {
    excel: (id) => run(id, 'excel'),
    word: (id) => run(id, 'word')
  }
}
