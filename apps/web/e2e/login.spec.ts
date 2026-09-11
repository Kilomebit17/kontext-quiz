import { expect, test } from '@playwright/test'
import { trackConsoleErrors } from './helpers'

/**
 * Nickname + password auth: the first login creates the account, the header
 * shows the avatar and @handle, and a wrong password is rejected.
 */
test('nickname + password creates an account and logs in', async ({ page }) => {
  const errors: string[] = []
  trackConsoleErrors(page, 'login', errors)
  const nickname = `e2e_${Date.now().toString(36)}`

  await page.goto('/login')
  await page.getByTestId('nickname-input').fill(`@${nickname}`)
  await page.getByTestId('password-input').fill('secret123')
  await page.getByTestId('password-submit').click()

  await expect(page).toHaveURL(/\/host$/)
  await expect(page.getByTestId('user-badge')).toContainText(`@${nickname}`)
  await expect(page.getByTestId('user-badge').getByTestId('avatar')).toBeVisible()

  // Log out, then a wrong password must fail and a right one must succeed.
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('login-link')).toBeVisible()

  await page.goto('/login')
  await page.getByTestId('nickname-input').fill(nickname)
  await page.getByTestId('password-input').fill('wrong-password')
  await page.getByTestId('password-submit').click()
  await expect(page.getByTestId('password-form')).toContainText(/пароль|password/i)
  await expect(page).toHaveURL(/\/login/)

  await page.getByTestId('password-input').fill('secret123')
  await page.getByTestId('password-submit').click()
  await expect(page).toHaveURL(/\/host$/)
  await expect(page.getByTestId('user-badge')).toContainText(`@${nickname}`)

  // Validation for a malformed handle happens client-side.
  await page.getByTestId('logout').click()
  await page.goto('/login')
  await page.getByTestId('nickname-input').fill('has space')
  await page.getByTestId('password-input').fill('secret123')
  await page.getByTestId('password-submit').click()
  await expect(page).toHaveURL(/\/login/)

  // Chromium logs every 4xx response as a console error; the one 401 (wrong password) is expected.
  expect(errors.filter((e) => !e.includes('status of 401'))).toEqual([])
})
