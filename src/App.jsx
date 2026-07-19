import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Shell from './components/layout/Shell'
import Home from './pages/Home'
import Login from './pages/Login'
import Chat from './pages/Chat'
import QA from './pages/QA'
import Draw from './pages/Draw'
import Scrapbook from './pages/Scrapbook'
import Gallery from './pages/Gallery'
import Mail from './pages/Mail'
import Milestones from './pages/Milestones'

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
            <Route path="/draw" element={<Draw />} />
            <Route path="/scrapbook" element={<Scrapbook />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/mail" element={<Mail />} />
            <Route path="/milestones" element={<Milestones />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}

export default App
