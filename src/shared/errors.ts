/** Business-rule errors raised by main services; the UI shows `messageAr`. */
export const errorMessages = {
  VESSEL_NOT_FOUND: 'الباخرة غير موجودة',
  VESSEL_INACTIVE: 'الباخرة غير نشطة ولا يمكن إصدار وثائق جديدة لها',
  PREFIX_LOCKED: 'لا يمكن تغيير حرف البوليصة بعد إصدار وثائق لهذه الباخرة',
  DOCUMENT_NOT_FOUND: 'الوثيقة غير موجودة'
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
