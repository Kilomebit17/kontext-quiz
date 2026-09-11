import { expect, test } from '@playwright/test'
import { trackConsoleErrors } from './helpers'

/** Player-facing screens on a phone viewport: no horizontal overflow, big touch targets. */
test('landing and join screens fit a phone viewport', async ({ page }) => {
  const errors: string[] = []
  trackConsoleErrors(page, 'mobile', errors)

  await page.goto('/')
  await expect(page.getByTestId('pin-input')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  const box = await page.getByTestId('pin-submit').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

  await page.goto('/join?pin=123456')
  await expect(page.getByTestId('nickname-input')).toBeVisible()
  const overflowJoin = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflowJoin).toBeLessThanOrEqual(0)

  await page.goto('/play')
  await expect(page.getByTestId('no-session')).toBeVisible()
  expect(errors).toEqual([])
})
