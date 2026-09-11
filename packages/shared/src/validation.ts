import { z } from 'zod'
import { isAvatarId } from './avatars'
import {
  MAX_NICKNAME,
  MAX_OPTION_TEXT,
  MAX_PASSWORD,
  MAX_QUESTION_TEXT,
  MAX_QUIZ_TITLE,
  MIN_PASSWORD,
} from './types'

export const optionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(MAX_OPTION_TEXT),
  isCorrect: z.boolean(),
})

const mediaUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed')
  .nullable()
  .optional()

const baseQuestion = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(MAX_QUESTION_TEXT),
  mediaUrl: mediaUrlSchema,
  timeLimit: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(20),
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]),
  pointsMultiplier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
})

export const questionSchema = z.discriminatedUnion('type', [
  baseQuestion.extend({
    type: z.literal('single'),
    text: z.string().min(1).max(MAX_QUESTION_TEXT),
    options: z
      .array(optionSchema)
      .min(2)
      .max(4)
      .refine((o) => o.filter((x) => x.isCorrect).length === 1, 'Exactly one correct option')
      .refine((o) => o.every((x) => x.text.trim().length > 0), 'Options must have text'),
  }),
  baseQuestion.extend({
    type: z.literal('multiple'),
    text: z.string().min(1).max(MAX_QUESTION_TEXT),
    options: z
      .array(optionSchema)
      .min(2)
      .max(4)
      .refine((o) => o.some((x) => x.isCorrect), 'At least one correct option')
      .refine((o) => o.every((x) => x.text.trim().length > 0), 'Options must have text'),
  }),
  baseQuestion.extend({
    type: z.literal('truefalse'),
    text: z.string().min(1).max(MAX_QUESTION_TEXT),
    options: z
      .array(optionSchema)
      .length(2)
      .refine((o) => o.filter((x) => x.isCorrect).length === 1, 'Exactly one correct option'),
  }),
  baseQuestion.extend({
    type: z.literal('text'),
    text: z.string().min(1).max(MAX_QUESTION_TEXT),
    options: z
      .array(optionSchema)
      .min(1)
      .max(10)
      .refine(
        (o) => o.every((x) => x.isCorrect && x.text.trim().length > 0),
        'Accepted answers must be non-empty',
      ),
  }),
  baseQuestion.extend({
    type: z.literal('info'),
    text: z.string().min(1).max(MAX_QUESTION_TEXT),
    options: z.array(optionSchema).max(0),
  }),
])

export const quizVisibilitySchema = z.enum(['private', 'public', 'link'])

export const quizInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_QUIZ_TITLE),
  coverUrl: mediaUrlSchema,
  visibility: quizVisibilitySchema.default('private'),
  questions: z.array(questionSchema).max(200),
})

export type QuizInput = z.infer<typeof quizInputSchema>

export const gameModeSchema = z.enum(['live', 'team', 'challenge', 'solo'])

export const gameSettingsSchema = z.object({
  mode: gameModeSchema.default('live'),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showQuestionOnPlayer: z.boolean().default(true),
  teamSize: z.number().int().min(2).max(5).default(3),
  endWhenAllAnswered: z.boolean().default(true),
})

export const createGameSchema = z
  .object({
    quizId: z.string().optional(),
    /** Inline quiz for guest hosts (localStorage quizzes). */
    quiz: quizInputSchema.optional(),
    settings: gameSettingsSchema.partial().optional(),
  })
  .refine((v) => Boolean(v.quizId) !== Boolean(v.quiz), 'Provide exactly one of quizId or quiz')

export const pinSchema = z.string().regex(/^\d{6}$/)

export const nicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NICKNAME)
  .regex(/^[\p{L}\p{N} _\-.!?']+$/u, 'Nickname contains invalid characters')

/** An avatar id from the catalogue, e.g. "navy-wink-3". */
export const avatarIdSchema = z
  .string()
  .max(64)
  .refine((v) => isAvatarId(v), 'Unknown avatar')

export const joinPayloadSchema = z.object({
  pin: pinSchema,
  nickname: nicknameSchema,
  teamId: z.string().max(40).nullable().optional(),
  /** Player-picked avatar; the server assigns a random one when omitted or unknown. */
  avatar: z.string().max(64).nullable().optional(),
})

export const avatarUpdateSchema = z.object({ avatar: avatarIdSchema })

export const answerPayloadSchema = z.object({
  questionIndex: z.number().int().min(0),
  optionIds: z.array(z.string().max(40)).max(4).optional(),
  text: z.string().max(200).optional(),
})

/** Account handle: 2–20 letters/digits/`_`/`.`/`-`, a leading `@` is tolerated and stripped. */
export const handleSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@+/, ''))
  .pipe(
    z
      .string()
      .min(2)
      .max(MAX_NICKNAME)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u, 'Handle contains invalid characters'),
  )

export const passwordLoginSchema = z.object({
  nickname: handleSchema,
  password: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD),
})

export const createChallengeSchema = z.object({
  quizId: z.string(),
  /** ISO date string. */
  deadline: z.string().datetime(),
})
