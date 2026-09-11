import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

/** Collects `console.error` output from a page so a test can assert there was none. */
export function trackConsoleErrors(page: Page, label: string, sink: string[]): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(`[${label}] ${msg.text()}`)
  })
  page.on('pageerror', (err) => sink.push(`[${label}] pageerror: ${err.message}`))
}

export interface PlayerSession {
  context: BrowserContext
  page: Page
  nickname: string
}

/** Open a fresh browser context, join the game with `nickname`, wait for the lobby. */
export async function joinAsPlayer(
  browser: Browser,
  pin: string,
  nickname: string,
  errors: string[],
  baseURL: string,
): Promise<PlayerSession> {
  const context = await browser.newContext({ baseURL, locale: 'uk-UA' })
  const page = await context.newPage()
  trackConsoleErrors(page, nickname, errors)
  await page.goto(`/join?pin=${pin}`)
  await expect(page.getByTestId('join-pin')).toBeVisible()
  await page.getByTestId('nickname-input').fill(nickname)
  await page.getByTestId('join-submit').click()
  await expect(page.getByTestId('player-lobby')).toBeVisible()
  return { context, page, nickname }
}

/** Selects a question type in the editor (the radio itself is visually hidden). */
export async function pickQuestionType(
  page: Page,
  type: 'single' | 'multiple' | 'truefalse' | 'text' | 'info',
) {
  await page.getByTestId(`type-${type}`).check({ force: true })
}

export async function fillOptions(page: Page, texts: string[], correct: number[]) {
  for (let i = 0; i < texts.length; i++) {
    await page.getByTestId(`option-text-${i}`).fill(texts[i] ?? '')
  }
  for (let i = 0; i < texts.length; i++) {
    const box = page.getByTestId(`option-correct-${i}`)
    if (correct.includes(i)) await box.check({ force: true })
    else if (await box.isChecked()) await box.uncheck({ force: true })
  }
}

/** Wait until the host screen shows the given phase. */
export async function expectHostStatus(page: Page, status: string) {
  await expect(page.getByTestId('host-screen')).toHaveAttribute('data-status', status, {
    timeout: 20_000,
  })
}

export async function readScore(page: Page): Promise<number> {
  const text = await page.getByTestId('player-score').textContent()
  return Number.parseInt((text ?? '0').replace(/\D/g, '') || '0', 10)
}
