import { expect, test } from '@playwright/test'
import { expectHostStatus, joinAsPlayer, trackConsoleErrors } from './helpers'

const API = `http://localhost:${process.env.E2E_API_PORT ?? '4000'}`
const DEMO_QUIZ = '00000000-0000-4000-8000-000000000002' // "World capitals" (seeded in memory mode)

/**
 * Team mode: players are auto-assigned to teams, answer buttons stay locked
 * during the 5 s discussion window, and the leaderboard ranks teams by the
 * average of their members' scores.
 */
test('team mode locks answers during discussion and ranks teams', async ({ browser, baseURL }) => {
  test.setTimeout(120_000)
  const errors: string[] = []

  const res = await fetch(`${API}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quizId: DEMO_QUIZ,
      settings: { mode: 'team', teamSize: 2, showQuestionOnPlayer: true },
    }),
  })
  expect(res.status).toBe(201)
  const game = (await res.json()) as {
    sessionId: string
    pin: string
    hostToken: string
    joinUrl: string
  }

  const hostContext = await browser.newContext({ baseURL, locale: 'uk-UA' })
  const host = await hostContext.newPage()
  trackConsoleErrors(host, 'host', errors)
  await host.goto('/host')
  await host.evaluate(
    ([id, hostToken, joinUrl]) =>
      sessionStorage.setItem(`kq.host.${id}`, JSON.stringify({ hostToken, joinUrl })),
    [game.sessionId, game.hostToken, game.joinUrl],
  )
  await host.goto(`/host/game/${game.sessionId}`)
  await expectHostStatus(host, 'lobby')

  const olia = await joinAsPlayer(browser, game.pin, 'Оля', errors, baseURL ?? '')
  const maksym = await joinAsPlayer(browser, game.pin, 'Максим', errors, baseURL ?? '')
  const ira = await joinAsPlayer(browser, game.pin, 'Ira', errors, baseURL ?? '')

  await expect(host.getByTestId('player-count')).toHaveText('3')
  await host.getByTestId('host-start').click()
  await expectHostStatus(host, 'question')

  // Discussion window: no answer buttons yet.
  await expect(olia.page.getByTestId('discussion')).toBeVisible()
  await expect(olia.page.getByTestId('option-0')).toHaveCount(0)

  // After the window the grid unlocks (5 s discussion + countdown slack).
  await expect(olia.page.getByTestId('option-0')).toBeVisible({ timeout: 10_000 })
  await expect(olia.page.getByTestId('discussion')).toHaveCount(0)

  await olia.page.getByTestId('option-0').click()
  await maksym.page.getByTestId('option-1').click()
  await ira.page.getByTestId('option-2').click()
  // (the last answer triggers auto-reveal, so the "answer accepted" screen may already be gone)

  // All three answered → auto-reveal.
  await expectHostStatus(host, 'reveal')
  await host.getByTestId('host-next').click()
  await expectHostStatus(host, 'leaderboard')

  // Two teams of ≤2 for three players; leaderboard lists teams, not players.
  const rows = host.getByTestId('leaderboard').locator('li')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Команда')

  expect(errors).toEqual([])
  await hostContext.close()
  for (const p of [olia, maksym, ira]) await p.context.close()
})
