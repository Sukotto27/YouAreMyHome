// Every campaign room's annex, in isolation: one player starts at the annex entrance and must reach the exit by
// timing the permanent hazards (the pilot looks ahead). The rest of each room has its own check-doors-ch1-NN script.
//   node scripts/check-doors-annex.mjs
import fs from 'node:fs'
import { createGame } from '../src/doors/engine.js'
import { parseLevel } from '../src/doors/levels.js'
import { makeChecker } from './lib/pilot.mjs'
import { crossAnnex } from './lib/annex.mjs'

const { check, finish } = makeChecker()
const dir = new URL('../src/doors/levels/', import.meta.url)
for (const file of fs.readdirSync(dir).filter((f) => /^ch\d+-\d+-.*\.json$/.test(f)).sort()) {
  const json = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'))
  if (!json.annex) continue
  const g = createGame(parseLevel(json), { blue: { maxHearts: 6 }, pink: { maxHearts: 6 } })
  for (const p of g.players) {
    p.x = json.annex.xa + 0.5
    p.y = 18
    p.onGround = false
  }
  g.players[1].x = json.annex.xa + 1.5
  // each player alone on the annex (the other is parked at the start, out of the way)
  const r = crossAnnex(g, 'pink', json.annex)
  check(`${file}: crossed ${json.annex.stories.length} stor${json.annex.stories.length > 1 ? 'ies' : 'y'} to the exit`, r.ok && r.deaths === 0, `${(r.frames / 60).toFixed(1)}s, deaths ${r.deaths}`)
}
finish('Annex')
