import { useGameAttention } from '../../context/GameAttentionContext'

// Landing screen for Games — a small, growable menu of shared activities.
// Draw also holds the Scrapbook now (saved drawings live inside it as a
// tab), so it no longer needs its own top-level nav item.
//
// "You Are My Home — The Game" is its own installable PWA (separate Vite
// app under apps/home-game, deployed alongside this one at /game/) rather
// than a component here, so it's a plain link out instead of a view.

const CARD_CLASS =
  'relative rounded-2xl border border-teal/30 bg-white/60 px-4 py-4 text-left transition-colors hover:border-rose'

export default function GamesMenu({
  onSelectDraw,
  onSelectMadLibs,
  onSelectStory,
  onSelectSong,
  onSelectFarkle,
  onSelectUno,
  onSelectObstacleDrop,
  onSelectRps,
  onSelectPong,
  onSelectBananagrams,
  onSelectCac,
  onSelectDoors,
}) {
  const { byGame } = useGameAttention()

  const games = [
    { key: 'draw', title: 'Draw', text: 'Sketch together on a shared canvas, save your favorites', onSelect: onSelectDraw },
    { key: 'madlibs', title: 'Mad Libs', text: 'Fill in the blanks separately, then compare your stories', onSelect: onSelectMadLibs },
    {
      key: 'story',
      title: 'Never-Ending Story',
      text: 'Take turns leaving a blank for each other — pick it back up anytime',
      onSelect: onSelectStory,
    },
    {
      key: 'song',
      title: 'The Never-Ending Song',
      text: 'Like the story, but every line has to be a real song title',
      onSelect: onSelectSong,
    },
    { key: 'farkle', title: 'Farkle', text: "Roll for points, but don't push your luck too far", onSelect: onSelectFarkle },
    { key: 'uno', title: 'Uno', text: 'Match colors and numbers, race to empty your hand first', onSelect: onSelectUno },
    {
      key: 'obstacleDrop',
      title: 'Obstacle Drop',
      badge: 'Work in progress',
      text: 'Draw obstacles to steer the falling ball into your hole, not theirs',
      onSelect: onSelectObstacleDrop,
    },
    { key: 'rps', title: 'Rock Paper Scissors', text: 'Pick during the countdown, reveal on 0 — best of 3', onSelect: onSelectRps },
    { key: 'pong', title: 'Pong', text: 'Classic paddle rally — the ball speeds up every hit', onSelect: onSelectPong },
    {
      key: 'bananagrams',
      title: 'Bananagrams',
      text: 'Race to build a word grid from a shared pile of tiles',
      onSelect: onSelectBananagrams,
    },
    {
      key: 'cac',
      title: 'Cards Against Couples',
      text: 'Fill-in-the-blank cards for two — no judge, no score, just laughs',
      onSelect: onSelectCac,
    },
    {
      key: 'doors',
      title: 'Doors',
      badge: 'Work in progress',
      text: 'A two-player co-op platformer — work together to get both of you through the doors. Still in testing!',
      onSelect: onSelectDoors,
    },
  ]
  const paradise = { title: 'Our Little Paradise', text: 'A place just for us' }

  function renderBody(game) {
    return (
      <>
        <div className="flex items-center gap-2">
          <p className="font-body font-medium text-ink">{game.title}</p>
          {game.badge && (
            <span className="rounded-full bg-gold/20 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-wide text-gold">
              {game.badge}
            </span>
          )}
        </div>
        <p className="mt-1 font-body text-xs text-ink-soft">{game.text}</p>
        {byGame[game.key] && (
          <span className="absolute -right-1.5 -top-2 rounded-full bg-rose px-2 py-0.5 font-body text-[10px] font-semibold text-paper shadow-md ring-2 ring-paper">
            {byGame[game.key] === 'invite' ? 'Invited!' : 'Your turn'}
          </span>
        )}
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl italic text-ink">Games</h1>
        <p className="mt-1 font-hand text-xl text-ink-soft">something to play together</p>
      </div>

      <a
        href="/YouAreMyHome/game/"
        className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-4 text-left transition-colors hover:border-rose"
      >
        {renderBody(paradise)}
      </a>

      <div className="grid gap-3 sm:grid-cols-2">
        {games.map((game) => (
          <button key={game.key} type="button" onClick={game.onSelect} className={CARD_CLASS}>
            {renderBody(game)}
          </button>
        ))}
      </div>
    </div>
  )
}
