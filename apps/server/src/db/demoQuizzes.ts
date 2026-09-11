import type { Question, QuizInput } from '@kontext/shared'

/**
 * Demo quizzes seeded into Postgres (`pnpm db:seed`) and into the MemoryStore.
 * Ids are stable so links keep working across restarts.
 */
export interface DemoQuiz extends Omit<QuizInput, 'questions'> {
  id: string
  visibility: 'public'
  questions: Question[]
}

const opt = (id: string, text: string, isCorrect = false) => ({ id, text, isCorrect })

const ukraineQuestions: Question[] = [
  {
    id: 'ua-1',
    type: 'info',
    text: 'Швидкий тест про Україну. Готові? Відповідайте якомога швидше!',
    mediaUrl: null,
    options: [],
    timeLimit: 10,
    pointsMultiplier: 1,
  },
  {
    id: 'ua-2',
    type: 'single',
    text: 'Яка річка є найдовшою в межах України?',
    mediaUrl: null,
    options: [
      opt('ua-2-a', 'Дніпро', true),
      opt('ua-2-b', 'Дністер'),
      opt('ua-2-c', 'Південний Буг'),
      opt('ua-2-d', 'Десна'),
    ],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'ua-3',
    type: 'text',
    text: 'Столиця України (напишіть назву міста)',
    mediaUrl: null,
    options: [
      opt('ua-3-a', 'Київ', true),
      opt('ua-3-b', 'Kyiv', true),
      opt('ua-3-c', 'Kiev', true),
    ],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'ua-4',
    type: 'multiple',
    text: 'Які з цих країн межують з Україною?',
    mediaUrl: null,
    options: [
      opt('ua-4-a', 'Польща', true),
      opt('ua-4-b', 'Литва'),
      opt('ua-4-c', 'Молдова', true),
      opt('ua-4-d', 'Словаччина', true),
    ],
    timeLimit: 30,
    pointsMultiplier: 1,
  },
  {
    id: 'ua-5',
    type: 'truefalse',
    text: 'Говерла — найвища вершина України.',
    mediaUrl: null,
    options: [opt('ua-5-a', 'Правда', true), opt('ua-5-b', 'Неправда')],
    timeLimit: 10,
    pointsMultiplier: 1,
  },
  {
    id: 'ua-6',
    type: 'single',
    text: 'У якому році Україна проголосила незалежність?',
    mediaUrl: null,
    options: [
      opt('ua-6-a', '1989'),
      opt('ua-6-b', '1990'),
      opt('ua-6-c', '1991', true),
      opt('ua-6-d', '1992'),
    ],
    timeLimit: 20,
    pointsMultiplier: 2,
  },
]

const capitalsQuestions: Question[] = [
  {
    id: 'wc-1',
    type: 'single',
    text: 'What is the capital of Australia?',
    mediaUrl: null,
    options: [
      opt('wc-1-a', 'Sydney'),
      opt('wc-1-b', 'Canberra', true),
      opt('wc-1-c', 'Melbourne'),
      opt('wc-1-d', 'Perth'),
    ],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'wc-2',
    type: 'single',
    text: 'What is the capital of Canada?',
    mediaUrl: null,
    options: [
      opt('wc-2-a', 'Toronto'),
      opt('wc-2-b', 'Vancouver'),
      opt('wc-2-c', 'Ottawa', true),
      opt('wc-2-d', 'Montreal'),
    ],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'wc-3',
    type: 'truefalse',
    text: 'Bern is the capital of Switzerland.',
    mediaUrl: null,
    options: [opt('wc-3-a', 'True', true), opt('wc-3-b', 'False')],
    timeLimit: 10,
    pointsMultiplier: 1,
  },
  {
    id: 'wc-4',
    type: 'text',
    text: 'Type the capital of Japan.',
    mediaUrl: null,
    options: [opt('wc-4-a', 'Tokyo', true), opt('wc-4-b', 'Tōkyō', true)],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'wc-5',
    type: 'multiple',
    text: 'Which of these cities are national capitals?',
    mediaUrl: null,
    options: [
      opt('wc-5-a', 'Nairobi', true),
      opt('wc-5-b', 'Istanbul'),
      opt('wc-5-c', 'Lima', true),
      opt('wc-5-d', 'Zurich'),
    ],
    timeLimit: 30,
    pointsMultiplier: 2,
  },
]

export const DEMO_QUIZZES: DemoQuiz[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Україна: швидкий тест',
    coverUrl: null,
    visibility: 'public',
    questions: ukraineQuestions,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    title: 'World capitals',
    coverUrl: null,
    visibility: 'public',
    questions: capitalsQuestions,
  },
]
