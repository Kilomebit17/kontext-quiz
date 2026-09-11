import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  detectDelimiter,
  looksLikeHeader,
  parseCorrect,
  parseCsv,
  parseXlsx,
  rowsToQuestions,
} from './import'

describe('import: delimiter + header detection', () => {
  it('detects ; and ,', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
  })

  it('recognises a header row', () => {
    expect(
      looksLikeHeader(['question', 'option1', 'option2', 'option3', 'option4', 'correct', 'time']),
    ).toBe(true)
    expect(looksLikeHeader(['Запитання', 'Варіант 1', '', '', '', 'Правильний', 'Час'])).toBe(true)
    expect(looksLikeHeader(['Столиця України?', 'Київ', 'Львів', '', '', '1', '20'])).toBe(false)
  })

  it('parses correct column variants', () => {
    expect(parseCorrect('1', 4)).toEqual([0])
    expect(parseCorrect('1,3', 4)).toEqual([0, 2])
    expect(parseCorrect('3;1', 4)).toEqual([0, 2])
    expect(parseCorrect('B', 4)).toEqual([1])
    expect(parseCorrect('5', 4)).toBeNull()
    expect(parseCorrect('x', 4)).toBeNull()
  })
})

describe('import: CSV', () => {
  it('parses a ;-delimited file with a header row', async () => {
    const csv = [
      'question;option1;option2;option3;option4;correct;time',
      'Столиця України?;Київ;Львів;Одеса;Харків;1;20',
      'Земля кругла?;Так;Ні;;;1;10',
    ].join('\n')
    const { questions, warnings } = await parseCsv(csv)
    expect(warnings).toEqual([])
    expect(questions).toHaveLength(2)
    expect(questions[0]?.type).toBe('single')
    expect(questions[0]?.text).toBe('Столиця України?')
    expect(questions[0]?.options.map((o) => o.text)).toEqual(['Київ', 'Львів', 'Одеса', 'Харків'])
    expect(questions[0]?.options.filter((o) => o.isCorrect).map((o) => o.text)).toEqual(['Київ'])
    expect(questions[0]?.timeLimit).toBe(20)
    expect(questions[1]?.type).toBe('truefalse')
    expect(questions[1]?.options).toHaveLength(2)
    expect(questions[1]?.timeLimit).toBe(10)
  })

  it('parses a ,-delimited file without a header row and quoted commas', async () => {
    const csv = ['"2+2, 3+1?",4,5,6,7,1,5', 'Prime numbers?,2,4,5,9,"1,3",30'].join('\n')
    const { questions, warnings } = await parseCsv(csv)
    expect(warnings).toEqual([])
    expect(questions).toHaveLength(2)
    expect(questions[0]?.text).toBe('2+2, 3+1?')
    expect(questions[0]?.timeLimit).toBe(5)
    expect(questions[1]?.type).toBe('multiple')
    expect(questions[1]?.options.filter((o) => o.isCorrect).map((o) => o.text)).toEqual(['2', '5'])
  })

  it('reports skipped rows with reasons', async () => {
    const csv = [
      'Only one option;A;;;;1;20',
      ';A;B;;;1;20',
      'No correct;A;B;;;;20',
      'Bad correct;A;B;;;9;20',
    ].join('\n')
    const { questions, warnings } = await parseCsv(csv)
    expect(questions).toHaveLength(0)
    expect(warnings.map((w) => w.reason)).toEqual([
      'too-few-options',
      'no-question',
      'no-correct',
      'bad-correct',
    ])
  })

  it('snaps time limits to the nearest allowed value and defaults to 20', () => {
    const { questions } = rowsToQuestions([
      ['Q1', 'A', 'B', '', '', '1', '25'],
      ['Q2', 'A', 'B', '', '', '2', ''],
      ['Q3', 'A', 'B', '', '', '2', '1000'],
    ])
    expect(questions.map((q) => q.timeLimit)).toEqual([20, 20, 120])
  })

  it('strips a BOM', async () => {
    const { questions } = await parseCsv('﻿Q;A;B;;;1;10')
    expect(questions[0]?.text).toBe('Q')
  })
})

describe('import: XLSX', () => {
  it('parses a workbook built with SheetJS', async () => {
    const rows = [
      ['Запитання', 'Варіант 1', 'Варіант 2', 'Варіант 3', 'Варіант 4', 'Правильний', 'Час'],
      ['Найбільша планета?', 'Марс', 'Юпітер', 'Земля', 'Венера', 2, 30],
      ['Парні числа?', '2', '3', '4', '5', '1,3', 20],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { questions, warnings } = await parseXlsx(buf)
    expect(warnings).toEqual([])
    expect(questions).toHaveLength(2)
    expect(questions[0]?.options.find((o) => o.isCorrect)?.text).toBe('Юпітер')
    expect(questions[0]?.timeLimit).toBe(30)
    expect(questions[1]?.type).toBe('multiple')
    expect(questions[1]?.options.filter((o) => o.isCorrect).map((o) => o.text)).toEqual(['2', '4'])
  })
})
