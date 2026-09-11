import type { Question } from '@kontext/shared'

const opt = (id: string, text: string, isCorrect = false) => ({ id, text, isCorrect })

/** 4 scorable questions: single, multiple, text, truefalse. */
export function fourQuestions(): Question[] {
  return [
    {
      id: 'q1',
      type: 'single',
      text: '2 + 2 = ?',
      mediaUrl: null,
      options: [opt('q1a', '3'), opt('q1b', '4', true), opt('q1c', '5'), opt('q1d', '22')],
      timeLimit: 10,
      pointsMultiplier: 1,
    },
    {
      id: 'q2',
      type: 'multiple',
      text: 'Even numbers?',
      mediaUrl: null,
      options: [opt('q2a', '2', true), opt('q2b', '3'), opt('q2c', '4', true), opt('q2d', '5')],
      timeLimit: 20,
      pointsMultiplier: 1,
    },
    {
      id: 'q3',
      type: 'text',
      text: 'Capital of Ukraine?',
      mediaUrl: null,
      options: [opt('q3a', 'Київ', true), opt('q3b', 'Kyiv', true)],
      timeLimit: 10,
      pointsMultiplier: 1,
    },
    {
      id: 'q4',
      type: 'truefalse',
      text: 'The sky is blue.',
      mediaUrl: null,
      options: [opt('q4a', 'True', true), opt('q4b', 'False')],
      timeLimit: 5,
      pointsMultiplier: 2,
    },
  ]
}

/** Quiz input (API shape) with short 5-second limits for socket tests. */
export function shortQuizInput() {
  return {
    title: 'Socket test quiz',
    visibility: 'private' as const,
    questions: [
      {
        id: 's1',
        type: 'single' as const,
        text: 'Pick B',
        options: [opt('s1a', 'A'), opt('s1b', 'B', true), opt('s1c', 'C')],
        timeLimit: 5 as const,
        pointsMultiplier: 1 as const,
      },
      {
        id: 's2',
        type: 'truefalse' as const,
        text: 'True?',
        options: [opt('s2a', 'True', true), opt('s2b', 'False')],
        timeLimit: 5 as const,
        pointsMultiplier: 1 as const,
      },
      {
        id: 's3',
        type: 'text' as const,
        text: 'Type yes',
        options: [opt('s3a', 'yes', true)],
        timeLimit: 5 as const,
        pointsMultiplier: 2 as const,
      },
    ],
  }
}
