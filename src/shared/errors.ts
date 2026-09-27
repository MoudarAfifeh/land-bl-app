/** Business-rule errors raised by main services; the UI shows `messageAr`. */
export const errorMessages = {
  VESSEL_NOT_FOUND: 'الباخرة غير موجودة',
  VESSEL_INACTIVE: 'الباخرة غير نشطة ولا يمكن إصدار وثائق جديدة لها',
  PREFIX_LOCKED: 'لا يمكن تغيير حرف البوليصة بعد إصدار وثائق لهذه الباخرة',
  DOCUMENT_NOT_FOUND: 'الوثيقة غير موجودة',
  INVALID_DATA: 'البيانات غير صالحة، يرجى مراجعة الحقول',
  PRINT_FAILED: 'تعذّرت الطباعة',
  PDF_FAILED: 'تعذّر حفظ ملف PDF',
  EXCEL_FAILED: 'تعذّر تصدير ملف Excel',
  WORD_FAILED: 'تعذّر تصدير ملف Word',
  FILE_IN_USE: 'الملف مفتوح في برنامج آخر، أغلقه ثم أعد المحاولة',
  UNEXPECTED: 'حدث خطأ غير متوقع'
} as const

export type ErrorCode = keyof typeof errorMessages

export class ServiceError extends Error {
  readonly messageAr: string

  constructor(readonly code: ErrorCode) {
    super(code)
    this.name = 'ServiceError'
    this.messageAr = errorMessages[code]
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(errorMessages, value)
}

/**
 * Arabic message for an error thrown by `window.api`: its message is the error code
 * (see preload), anything else is unexpected.
 */
export function errorMessageAr(error: unknown): string {
  const code = error instanceof Error ? error.message : undefined
  return errorMessages[isErrorCode(code) ? code : 'UNEXPECTED']
}
