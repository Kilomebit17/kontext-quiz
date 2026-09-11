import type { Quiz, QuizInput, QuizSummary } from '@kontext/shared'
import { api } from './api'
import { isLocalId, LOCAL_ID_PREFIX, newId } from './ids'
import { QUIZZES_KEY, readJson, writeJson } from './storage'

export interface QuizRepo {
  readonly kind: 'local' | 'api'
  list(): Promise<QuizSummary[]>
  get(id: string): Promise<Quiz | null>
  create(input: QuizInput): Promise<Quiz>
  update(id: string, input: QuizInput): Promise<Quiz>
  remove(id: string): Promise<void>
  duplicate(id: string): Promise<Quiz>
}

export function toSummary(q: Quiz): QuizSummary {
  return {
    id: q.id,
    ownerId: q.ownerId,
    title: q.title,
    coverUrl: q.coverUrl ?? null,
    visibility: q.visibility,
    questionCount: q.questions.length,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  }
}

export function toInput(q: Quiz): QuizInput {
  return {
    title: q.title,
    coverUrl: q.coverUrl ?? null,
    visibility: q.visibility,
    questions: q.questions,
  }
}

/** Guest mode: quizzes in localStorage (`kq.quizzes`). */
export class LocalQuizRepo implements QuizRepo {
  readonly kind = 'local' as const

  readAll(): Quiz[] {
    return readJson<Quiz[]>('local', QUIZZES_KEY) ?? []
  }

  private writeAll(list: Quiz[]) {
    writeJson('local', QUIZZES_KEY, list)
  }

  clear(): void {
    this.writeAll([])
  }

  async list(): Promise<QuizSummary[]> {
    return this.readAll()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toSummary)
  }

  async get(id: string): Promise<Quiz | null> {
    return this.readAll().find((q) => q.id === id) ?? null
  }

  async create(input: QuizInput): Promise<Quiz> {
    const now = new Date().toISOString()
    const quiz: Quiz = {
      id: newId(LOCAL_ID_PREFIX),
      ownerId: null,
      title: input.title,
      coverUrl: input.coverUrl ?? null,
      visibility: input.visibility ?? 'private',
      questions: input.questions,
      createdAt: now,
      updatedAt: now,
    }
    this.writeAll([quiz, ...this.readAll()])
    return quiz
  }

  async update(id: string, input: QuizInput): Promise<Quiz> {
    const list = this.readAll()
    const idx = list.findIndex((q) => q.id === id)
    if (idx === -1) return this.create(input)
    const prev = list[idx] as Quiz
    const quiz: Quiz = {
      ...prev,
      title: input.title,
      coverUrl: input.coverUrl ?? null,
      visibility: input.visibility ?? prev.visibility,
      questions: input.questions,
      updatedAt: new Date().toISOString(),
    }
    list[idx] = quiz
    this.writeAll(list)
    return quiz
  }

  async remove(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((q) => q.id !== id))
  }

  async duplicate(id: string): Promise<Quiz> {
    const src = await this.get(id)
    if (!src) throw new Error('Quiz not found')
    return this.create({
      ...toInput(src),
      title: `${src.title} (2)`,
      questions: src.questions.map((q) => ({
        ...q,
        id: newId('q'),
        options: q.options.map((o) => ({ ...o, id: newId('o') })),
      })),
    })
  }
}

/** Logged-in mode: quizzes via the HTTP API. */
export class ApiQuizRepo implements QuizRepo {
  readonly kind = 'api' as const

  async list(): Promise<QuizSummary[]> {
    return (await api.quizzes.list()).quizzes
  }

  async get(id: string): Promise<Quiz | null> {
    try {
      return (await api.quizzes.get(id)).quiz
    } catch {
      return null
    }
  }

  async create(input: QuizInput): Promise<Quiz> {
    return (await api.quizzes.create(input)).quiz
  }

  async update(id: string, input: QuizInput): Promise<Quiz> {
    return (await api.quizzes.update(id, input)).quiz
  }

  async remove(id: string): Promise<void> {
    await api.quizzes.remove(id)
  }

  async duplicate(id: string): Promise<Quiz> {
    return (await api.quizzes.duplicate(id)).quiz
  }
}

export const localRepo = new LocalQuizRepo()
export const apiRepo = new ApiQuizRepo()

/** Pick the repo for a quiz id: local ids always come from localStorage. */
export function repoFor(id: string | null | undefined, loggedIn: boolean): QuizRepo {
  if (id && isLocalId(id)) return localRepo
  return loggedIn ? apiRepo : localRepo
}
