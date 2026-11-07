import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import GamesMenu from '../components/games/GamesMenu'
import { useGameAttention } from '../context/GameAttentionContext'
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

export default function Games() {
  const location = useLocation()
  const [view, setView] = useState(location.state?.view || 'menu') // 'menu' | 'draw' | 'madlibs' | 'story' | 'song' | 'farkle' | 'uno' | 'obstacleDrop' | 'rps' | 'pong' | 'bananagrams' | 'cac' | 'doors'

  const { markGameOpened, invite } = useGameAttention()
  // Opening a game answers its invite (including one that arrives while you're
  // already in that game), so its badge goes away.
  useEffect(() => {
    if (view !== 'menu') markGameOpened(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, invite?.id])

  if (view === 'draw') return <DrawGame onBack={() => setView('menu')} />
  if (view === 'madlibs') return <MadLibsGame onBack={() => setView('menu')} />
  if (view === 'story') return <NeverEndingStoryGame onBack={() => setView('menu')} />
  if (view === 'song') return <NeverEndingSongGame onBack={() => setView('menu')} />
  if (view === 'farkle') return <FarkleGame onBack={() => setView('menu')} />
  if (view === 'uno') return <UnoGame onBack={() => setView('menu')} />
  if (view === 'obstacleDrop') return <ObstacleDropGame onBack={() => setView('menu')} />
  if (view === 'rps') return <RockPaperScissorsGame onBack={() => setView('menu')} />
  if (view === 'pong') return <PongGame onBack={() => setView('menu')} />
  if (view === 'bananagrams') return <BananagramsGame onBack={() => setView('menu')} />
  if (view === 'cac') return <CardsAgainstCouplesGame onBack={() => setView('menu')} />
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
