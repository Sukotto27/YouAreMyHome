import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import GamesMenu from '../components/games/GamesMenu'
import DrawGame from '../components/games/DrawGame'
import MadLibsGame from '../components/games/MadLibsGame'
import NeverEndingStoryGame from '../components/games/NeverEndingStoryGame'
import FarkleGame from '../components/games/FarkleGame'
import ObstacleDropGame from '../components/games/ObstacleDropGame'

export default function Games() {
  const location = useLocation()
  const [view, setView] = useState(location.state?.view || 'menu') // 'menu' | 'draw' | 'madlibs' | 'story' | 'farkle' | 'obstacleDrop'

  if (view === 'draw') return <DrawGame onBack={() => setView('menu')} />
  if (view === 'madlibs') return <MadLibsGame onBack={() => setView('menu')} />
  if (view === 'story') return <NeverEndingStoryGame onBack={() => setView('menu')} />
  if (view === 'farkle') return <FarkleGame onBack={() => setView('menu')} />
  if (view === 'obstacleDrop') return <ObstacleDropGame onBack={() => setView('menu')} />

  return (
    <GamesMenu
      onSelectDraw={() => setView('draw')}
      onSelectMadLibs={() => setView('madlibs')}
      onSelectStory={() => setView('story')}
      onSelectFarkle={() => setView('farkle')}
      onSelectObstacleDrop={() => setView('obstacleDrop')}
    />
  )
}
