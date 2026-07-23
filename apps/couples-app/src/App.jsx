import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Shell from './components/layout/Shell'
import Home from './pages/Home'
import Login from './pages/Login'
import Chat from './pages/Chat'
import QA from './pages/QA'
import Games from './pages/Games'
import Music from './pages/Music'
import Gallery from './pages/Gallery'
import Mail from './pages/Mail'
import Calendar from './pages/Calendar'
import Journal from './pages/Journal'
import ShareTarget from './pages/ShareTarget'
import Settings from './pages/Settings'

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/qa" element={<QA />} />
            <Route path="/games" element={<Games />} />
            <Route path="/music" element={<Music />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/mail" element={<Mail />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/share-target" element={<ShareTarget />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}

export default App
