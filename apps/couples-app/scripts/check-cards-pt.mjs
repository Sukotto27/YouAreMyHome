// Checks that the Portuguese subtext lists line up with the English cards.
import { PROMPTS, ANSWERS, BLANK } from '../src/lib/cardsAgainstCouples.js'
import { PROMPTS_PT, ANSWERS_PT } from '../src/lib/cardsAgainstCouplesPt.js'

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed++
}
check(PROMPTS_PT.length === PROMPTS.length, `prompts: ${PROMPTS_PT.length} PT / ${PROMPTS.length} EN`)
check(ANSWERS_PT.length === ANSWERS.length, `answers: ${ANSWERS_PT.length} PT / ${ANSWERS.length} EN`)
const count = (s) => s.split(BLANK).length - 1
const badBlanks = PROMPTS.map((p, i) => [i, p]).filter(([i, p]) => count(p) !== count(PROMPTS_PT[i] ?? ''))
check(badBlanks.length === 0, `every prompt keeps its blank count${badBlanks.length ? ': ' + badBlanks.map(([i]) => i).join(',') : ''}`)
check(PROMPTS_PT.every((s) => s.trim()) && ANSWERS_PT.every((s) => s.trim()), 'no empty translations')
if (failed) process.exit(1)
console.log('\nAll Portuguese card checks passed')
