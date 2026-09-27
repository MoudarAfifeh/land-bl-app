import type { WizardStep } from '@shared/fields'

/** The four field steps from field-map.md, then the review. */
export type Step = WizardStep | 5

export const REVIEW_STEP = 5

export const stepTitles: Record<Step, string> = {
  1: 'الباخرة والأطراف',
  2: 'التحميل',
  3: 'الجودة وموظف التجهيز',
  4: 'النقل',
  5: 'المراجعة والحفظ'
}

export const allSteps = [1, 2, 3, 4, 5] as const satisfies readonly Step[]

const FOCUSABLE = 'input:not([type=hidden]):not(:disabled), button[role=combobox]:not(:disabled)'

/** The fields Enter moves between, in DOM order (which is the RTL visual order). */
export function focusableFields(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden]')
  )
}
