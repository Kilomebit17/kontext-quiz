import { expect, test, type Page } from '@playwright/test'
import {
  expectHostStatus,
  fillOptions,
  joinAsPlayer,
  pickQuestionType,
  readScore,
  trackConsoleErrors,
} from './helpers'

/**
 * Full live game: a guest host builds a 5-question quiz in the editor, starts a game,
 * three players join from separate browser contexts, everybody plays through to the
 * podium and the results table, and no page logs a console error.
 */
test.describe('full live game', () => {
  test.setTimeout(240_000)

  test('editor → lobby → 5 questions → podium → results + CSV', async ({ browser, baseURL }) => {
    const errors: string[] = []
    const hostContext = await browser.newContext({
      baseURL,
      locale: 'uk-UA',
      acceptDownloads: true,
    })
    const host = await hostContext.newPage()
    trackConsoleErrors(host, 'host', errors)

    // --- Build the quiz in the editor (guest mode → localStorage) ---------------------------
    await host.goto('/host/quiz/new')
    await expect(host.getByTestId('editor')).toBeVisible()
    await host.getByTestId('quiz-title').fill('E2E: Столиці')

    // Q1 single
    await host.getByTestId('question-text').fill('Столиця України?')
    await fillOptions(host, ['Київ', 'Львів', 'Одеса', 'Харків'], [0])

    // Q2 true/false
    await host.getByTestId('add-question').click()
    await pickQuestionType(host, 'truefalse')
    await host.getByTestId('question-text').fill('Дніпро впадає в Чорне море?')
    await host.getByTestId('option-correct-0').check({ force: true })

    // Q3 multiple
    await host.getByTestId('add-question').click()
    await pickQuestionType(host, 'multiple')
    await host.getByTestId('question-text').fill('Які з цих міст в Україні?')
    await fillOptions(host, ['Одеса', 'Варшава', 'Харків', 'Прага'], [0, 2])

    // Q4 text
    await host.getByTestId('add-question').click()
    await pickQuestionType(host, 'text')
    await host.getByTestId('question-text').fill('Напиши назву столиці України')
    await host.getByTestId('accepted-0').fill('Київ')

    // Q5 single
    await host.getByTestId('add-question').click()
    await pickQuestionType(host, 'single')
    await host.getByTestId('question-text').fill('Найбільше місто на заході України?')
    await fillOptions(host, ['Львів', 'Ужгород', 'Луцьк', 'Рівне'], [0])

    await expect(host.getByTestId('question-list').locator('li')).toHaveCount(5)

    // --- Start a live game -------------------------------------------------------------------
    await host.getByTestId('editor-start').click()
    await expect(host.getByTestId('game-settings-modal')).toBeVisible()
    await host.getByTestId('show-question').check({ force: true })
    await host.getByTestId('create-game').click()
    await expect(host).toHaveURL(/\/host\/game\//)
    await expectHostStatus(host, 'lobby')

    const pin = (await host.getByTestId('pin-display').getAttribute('data-pin')) ?? ''
    expect(pin).toMatch(/^\d{6}$/)
    await expect(host.getByTestId('qr-code')).toBeVisible()
    await expect(host.getByTestId('host-start')).toBeDisabled()

    // --- Three players join ------------------------------------------------------------------
    const olia = await joinAsPlayer(browser, pin, 'Оля', errors, baseURL ?? '')
    const maksym = await joinAsPlayer(browser, pin, 'Максим', errors, baseURL ?? '')
    const ira = await joinAsPlayer(browser, pin, 'Ira', errors, baseURL ?? '')
    const players = [olia, maksym, ira]

    for (const p of players) {
      await expect(host.getByTestId(`player-chip-${p.nickname}`)).toBeVisible()
    }
    await expect(host.getByTestId('player-count')).toHaveText('3')
    await expect(host.getByTestId('host-start')).toBeEnabled()

    // --- Q1: single ---------------------------------------------------------------------------
    await host.getByTestId('host-start').click()
    await expectHostStatus(host, 'question')
    await expect(host.getByTestId('host-question-progress')).toContainText('1')
    for (const p of players) await expect(p.page.getByTestId('answer-grid')).toBeVisible()
    await expect(olia.page.getByTestId('player-question-text')).toContainText('Столиця')

    await olia.page.getByTestId('option-0').click() // correct
    await maksym.page.getByTestId('option-1').click() // wrong
    await ira.page.getByTestId('option-0').click() // correct
    // (the last answer triggers auto-reveal, so the "answer accepted" screen may already be gone)
    await expect(host.getByTestId('answered-counter')).toContainText('3')

    // Everyone answered → the server reveals on its own (endWhenAllAnswered).
    await expectHostStatus(host, 'reveal')
    await expect(host.getByTestId('correct-percent')).toContainText('67')
    await expect(olia.page.getByTestId('player-reveal')).toHaveAttribute('data-outcome', 'correct')
    await expect(maksym.page.getByTestId('player-reveal')).toHaveAttribute(
      'data-outcome',
      'incorrect',
    )
    await expect(olia.page.getByTestId('points-earned')).not.toHaveText('+0')
    const oliaAfterQ1 = await readScore(olia.page)
    expect(oliaAfterQ1).toBeGreaterThan(0)

    await host.getByTestId('host-next').click() // → leaderboard
    await expectHostStatus(host, 'leaderboard')
    await expect(host.getByTestId('leaderboard').locator('li')).toHaveCount(3)
    await expect(olia.page.getByTestId('player-leaderboard')).toBeVisible()

    // --- Q2: true/false -----------------------------------------------------------------------
    await host.getByTestId('host-next').click() // → get_ready → question
    await expectHostStatus(host, 'question')
    await expect(host.getByTestId('host-question-progress')).toContainText('2')
    for (const p of players) await expect(p.page.getByTestId('answer-grid')).toBeVisible()
    await olia.page.getByTestId('option-0').click()
    await maksym.page.getByTestId('option-0').click()
    await ira.page.getByTestId('option-1').click()
    // (the last answer triggers auto-reveal, so the "answer accepted" screen may already be gone)
    // Everyone answered → the server reveals on its own (endWhenAllAnswered).
    await expectHostStatus(host, 'reveal')
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'leaderboard')

    // --- Q3: multiple, player 2 reloads mid-question -----------------------------------------
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'question')
    await expect(host.getByTestId('host-question-progress')).toContainText('3')
    await expect(maksym.page.getByTestId('answer-grid')).toBeVisible()
    const maksymBefore = await readScore(maksym.page)

    await maksym.page.reload()
    await expect(maksym.page.getByTestId('answer-grid')).toBeVisible({ timeout: 20_000 })
    expect(await readScore(maksym.page)).toBe(maksymBefore) // score survived the reload

    await maksym.page.getByTestId('option-0').click()
    await maksym.page.getByTestId('option-2').click()
    await maksym.page.getByTestId('submit-answer').click()
    await expect(maksym.page.getByTestId('answer-accepted')).toBeVisible()

    await olia.page.getByTestId('option-0').click()
    await olia.page.getByTestId('submit-answer').click()
    await ira.page.getByTestId('option-1').click() // wrong
    await ira.page.getByTestId('submit-answer').click()
    // (the last answer triggers auto-reveal, so the "answer accepted" screen may already be gone)

    // Everyone answered → the server reveals on its own (endWhenAllAnswered).
    await expectHostStatus(host, 'reveal')
    await expect(maksym.page.getByTestId('player-reveal')).toHaveAttribute(
      'data-outcome',
      'correct',
    )
    expect(await readScore(maksym.page)).toBeGreaterThan(maksymBefore)
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'leaderboard')

    // --- Q4: text -----------------------------------------------------------------------------
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'question')
    await expect(host.getByTestId('host-question-progress')).toContainText('4')
    for (const p of players) await expect(p.page.getByTestId('text-answer')).toBeVisible()
    await olia.page.getByTestId('text-answer').fill('київ')
    await olia.page.getByTestId('submit-answer').click()
    await maksym.page.getByTestId('text-answer').fill('Львів')
    await maksym.page.getByTestId('submit-answer').click()
    await ira.page.getByTestId('text-answer').fill('Київ ')
    await ira.page.getByTestId('submit-answer').click()
    // (the last answer triggers auto-reveal, so the "answer accepted" screen may already be gone)
    // Everyone answered → the server reveals on its own (endWhenAllAnswered).
    await expectHostStatus(host, 'reveal')
    await expect(olia.page.getByTestId('player-reveal')).toHaveAttribute('data-outcome', 'correct')
    await expect(maksym.page.getByTestId('player-reveal')).toHaveAttribute(
      'data-outcome',
      'incorrect',
    )
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'leaderboard')

    // --- Q5: single; Ira never answers (late) ------------------------------------------------
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'question')
    await expect(host.getByTestId('host-question-progress')).toContainText('5')
    await expect(ira.page.getByTestId('answer-grid')).toBeVisible()
    await olia.page.getByTestId('option-0').click()
    await maksym.page.getByTestId('option-0').click()
    await expect(olia.page.getByTestId('answer-accepted')).toBeVisible()
    await expect(maksym.page.getByTestId('answer-accepted')).toBeVisible()
    const iraBefore = await readScore(ira.page)
    await host.getByTestId('host-next').click() // skip while Ira has not answered
    await expectHostStatus(host, 'reveal')
    await expect(ira.page.getByTestId('player-reveal')).toHaveAttribute('data-outcome', 'none')
    expect(await readScore(ira.page)).toBe(iraBefore) // nothing counted for the missing answer
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'leaderboard')

    // --- Podium -------------------------------------------------------------------------------
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'podium')
    await expect(host.getByTestId('podium')).toBeVisible()
    for (const place of [1, 2, 3]) await expect(host.getByTestId(`podium-${place}`)).toBeVisible()
    await expect(host.getByTestId('podium-1')).toContainText('Оля')
    await expect(olia.page.getByTestId('final-rank')).toContainText('1')

    // --- Ended: results table + CSV download --------------------------------------------------
    await host.getByTestId('host-next').click()
    await expectHostStatus(host, 'ended')
    await expect(host.getByTestId('results-table').getByTestId('results-row')).toHaveCount(3)
    const downloadPromise = host.waitForEvent('download')
    await host.getByTestId('download-csv').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
    for (const p of players) await expect(p.page.getByTestId('player-final')).toBeVisible()

    // --- No console errors anywhere -----------------------------------------------------------
    expect(errors).toEqual([])

    await Promise.all(players.map((p) => p.context.close()))
    await hostContext.close()
  })
})

test.describe('landing PIN pre-check', () => {
  test('unknown PIN shows an inline error and stays on the landing page', async ({ page }) => {
    const errors: string[] = []
    trackConsoleErrors(page, 'landing', errors)
    await page.goto('/')
    await typePin(page, '999999')
    await expect(page.getByTestId('pin-error')).not.toBeEmpty()
    await expect(page).toHaveURL(/\/$/)
    expect(errors).toEqual([])
  })
})

async function typePin(page: Page, pin: string) {
  await page.getByTestId('pin-digit-0').click()
  await page.keyboard.type(pin)
}
