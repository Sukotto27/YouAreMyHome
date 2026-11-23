import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import GamesMenu from '../components/games/GamesMenu'
import { useGameAttention } from '../context/GameAttentionContext'
import { usePublishGamePresence } from '../hooks/useGamePresence'
import DrawGame from '../components/games/DrawGame'
import MadLibsGame from '../components/games/MadLibsGame'
import NeverEndingStoryGame from '../components/games/NeverEndingStoryGame'
import NeverEndingSongGame from '../components/games/NeverEndingSongGame'
import FarkleGame from '../components/games/FarkleGame'
import UnoGame from '../components/games/UnoGame'
import ObstacleDropGame from '../components/games/ObstacleDropGame'
import RockPaperScissorsGame from '../components/games/RockPaperScissorsGame'
import PongGame from '../components/games/PongGame'
import BananagramsGame from '../components/games/BananagramsGame'
import CardsAgainstCouplesGame from '../components/games/CardsAgainstCouplesGame'
import DoorsGame from '../components/games/DoorsGame'
import { PartnerHereBadge } from '../components/games/GameLobby'

export default function Games() {
  const location = useLocation()
  const [view, setView] = useState(location.state?.view || 'menu') // 'menu' | 'draw' | 'madlibs' | 'story' | 'song' | 'farkle' | 'uno' | 'obstacleDrop' | 'rps' | 'pong' | 'bananagrams' | 'cac' | 'doors'

  usePublishGamePresence(view === 'menu' ? null : view)
  const { markGameOpened, invite } = useGameAttention()
  // Opening a game answers its invite (including one that arrives while you're
  // already in that game), so its badge goes away.
  useEffect(() => {
    if (view !== 'menu') markGameOpened(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, invite?.id])

  // Every game (bar Doors, which is one shared keyboard) gets a slim strip showing whether your
  // partner has the same game open right now.
  const inGame = (node) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PartnerHereBadge gameKey={view} />
      {node}
    </div>
  )

  if (view === 'draw') return inGame(<DrawGame onBack={() => setView('menu')} />)
  if (view === 'madlibs') return inGame(<MadLibsGame onBack={() => setView('menu')} />)
  if (view === 'story') return inGame(<NeverEndingStoryGame onBack={() => setView('menu')} />)
  if (view === 'song') return inGame(<NeverEndingSongGame onBack={() => setView('menu')} />)
  if (view === 'farkle') return inGame(<FarkleGame onBack={() => setView('menu')} />)
  if (view === 'uno') return inGame(<UnoGame onBack={() => setView('menu')} />)
  if (view === 'obstacleDrop') return inGame(<ObstacleDropGame onBack={() => setView('menu')} />)
  if (view === 'rps') return inGame(<RockPaperScissorsGame onBack={() => setView('menu')} />)
  if (view === 'pong') return inGame(<PongGame onBack={() => setView('menu')} />)
  if (view === 'bananagrams') return inGame(<BananagramsGame onBack={() => setView('menu')} />)
  if (view === 'cac') return inGame(<CardsAgainstCouplesGame onBack={() => setView('menu')} />)
  if (view === 'doors') return <DoorsGame onBack={() => setView('menu')} />

  return (
    <GamesMenu
      onSelectDraw={() => setView('draw')}
      onSelectMadLibs={() => setView('madlibs')}
      onSelectStory={() => setView('story')}
      onSelectSong={() => setView('song')}
      onSelectFarkle={() => setView('farkle')}
      onSelectUno={() => setView('uno')}
      onSelectObstacleDrop={() => setView('obstacleDrop')}
      onSelectRps={() => setView('rps')}
      onSelectPong={() => setView('pong')}
      onSelectBananagrams={() => setView('bananagrams')}
      onSelectCac={() => setView('cac')}
      onSelectDoors={() => setView('doors')}
    />
  )
}
