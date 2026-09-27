import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'

const ARABIC_INDIC = /[٠-٩۰-۹]/
const monthYear = (d: Date): string =>
  new Intl.DateTimeFormat('ar-SY-u-nu-latn', { month: 'long', year: 'numeric' }).format(d)

let app: ElectronApplication
let userData: string
let page: Page

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-'))
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
  page = await app.firstWindow()
  await page.evaluate(() => (location.hash = '#/new'))
})

test.afterAll(async () => {
  // The form has unsaved changes: destroy the window so no "leave without saving?" prompt shows.
  await app?.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.destroy()
  })
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const issueDate = (): ReturnType<Page['locator']> => page.locator('#doc-issueDate')
const calendar = (): ReturnType<Page['getByTestId']> => page.getByTestId('date-calendar')

test('the calendar header shows Levantine month names with Latin digits', async () => {
  await issueDate().fill('03/02/2026')
  await page.getByRole('button', { name: 'اختر التاريخ من التقويم' }).first().click()
  await expect(calendar()).toBeVisible()
  // After the open animation (fade and zoom), so the screenshot shows the settled calendar.
  await calendar().evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: test.info().outputPath('calendar-open.png') })

  // The visible month and year of the dropdowns, and the grid's accessible name.
  const header = await calendar().locator('.rdp-caption_label').allInnerTexts()
  expect(header).toEqual(['شباط', '2026'])
  expect(header.join(' ')).not.toMatch(ARABIC_INDIC)
  await expect(calendar().getByRole('grid')).toHaveAccessibleName('شباط 2026')
  const days = await calendar().locator('.rdp-day').allInnerTexts()
  expect(days.join(' ')).not.toMatch(ARABIC_INDIC)
  expect(days).toContain('28')

  // The typed date is the selected day, and the week starts on Saturday.
  await expect(calendar().getByRole('button', { name: /3 شباط 2026، محدد$/ })).toBeFocused()
  const weekdays = await calendar().locator('.rdp-weekday').allInnerTexts()
  expect(weekdays[0]).toBe('س')

  await page.keyboard.press('Escape')
  await expect(calendar()).toBeHidden()
  await expect(issueDate()).toBeFocused()
})

test('picking a day in another month and year fills DD/MM/YYYY and returns focus', async () => {
  await issueDate().press('Alt+ArrowDown')
  await expect(calendar()).toBeVisible()
  await calendar().getByRole('combobox', { name: 'اختر السنة' }).selectOption('2025')
  await calendar().getByRole('combobox', { name: 'اختر الشهر' }).selectOption('0')
  await expect(calendar().getByRole('grid')).toHaveAccessibleName(monthYear(new Date(2025, 0)))
  await calendar()
    .getByRole('button', { name: /15 كانون الثاني 2025$/ })
    .click()

  await expect(calendar()).toBeHidden()
  await expect(issueDate()).toHaveValue('15/01/2025')
  await expect(issueDate()).toBeFocused()
})

test('keyboard: arrows move between days and Enter picks', async () => {
  await issueDate().fill('15/01/2025')
  await issueDate().press('Alt+ArrowDown')
  await expect(
    calendar().getByRole('button', { name: /15 كانون الثاني 2025، محدد$/ })
  ).toBeFocused()
  await page.keyboard.press('ArrowLeft') // RTL: left is the next day
  await page.keyboard.press('Enter')
  await expect(issueDate()).toHaveValue('16/01/2025')
})

test('picking the selected day again keeps the date and closes the calendar', async () => {
  await issueDate().fill('20/03/2026')
  await issueDate().press('Alt+ArrowDown')
  await calendar()
    .getByRole('button', { name: /20 آذار 2026، محدد$/ })
    .click()
  await expect(calendar()).toBeHidden()
  await expect(issueDate()).toHaveValue('20/03/2026')
})

test('the calendar button is not a tab stop', async () => {
  await issueDate().focus()
  await page.keyboard.press('Shift+Tab')
  await expect(
    page.getByRole('button', { name: 'اختر التاريخ من التقويم' }).first()
  ).not.toBeFocused()
})

test('the calendar works inside the add-vessel dialog', async () => {
  await page.getByRole('button', { name: 'إضافة باخرة' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const arrival = dialog.locator('#vessel-arrival')
  await arrival.fill('10/09/2026')
  await dialog.getByRole('button', { name: 'اختر التاريخ من التقويم' }).click()
  await expect(calendar()).toBeVisible()
  await calendar()
    .getByRole('button', { name: /12 أيلول 2026$/ })
    .click()

  await expect(calendar()).toBeHidden()
  await expect(dialog).toBeVisible() // picking a day doesn't close the dialog
  await expect(arrival).toHaveValue('12/09/2026')
  await expect(arrival).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
