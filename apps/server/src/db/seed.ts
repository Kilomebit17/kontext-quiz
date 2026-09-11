import { loadEnvFiles } from '../env.js'
import { createDb } from './client.js'
import { DEMO_QUIZZES } from './demoQuizzes.js'
import { quizzes } from './schema.js'

loadEnvFiles()

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required to seed')
  process.exit(1)
}

const { db, sql } = createDb(url, { max: 1 })
try {
  for (const demo of DEMO_QUIZZES) {
    await db
      .insert(quizzes)
      .values({
        id: demo.id,
        ownerId: null,
        title: demo.title,
        coverUrl: demo.coverUrl ?? null,
        visibility: demo.visibility,
        questions: demo.questions,
      })
      .onConflictDoUpdate({
        target: quizzes.id,
        set: {
          title: demo.title,
          coverUrl: demo.coverUrl ?? null,
          visibility: demo.visibility,
          questions: demo.questions,
          updatedAt: new Date(),
        },
      })
    console.log(`seeded quiz "${demo.title}" (${demo.id})`)
  }
} finally {
  await sql.end()
}
