import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import GamesMenu from '../components/games/GamesMenu'
import DrawGame from '../components/games/DrawGame'
import MadLibsGame from '../components/games/MadLibsGame'

export default function Games() {
  const location = useLocation()
  const [view, setView] = useState(location.state?.view || 'menu') // 'menu' | 'draw' | 'madlibs'

  if (view === 'draw') return <DrawGame onBack={() => setView('menu')} />
  if (view === 'madlibs') return <MadLibsGame onBack={() => setView('menu')} />

  return <GamesMenu onSelectDraw={() => setView('draw')} onSelectMadLibs={() => setView('madlibs')} />
}
