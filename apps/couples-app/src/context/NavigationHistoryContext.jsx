import { createContext, useContext, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const NavigationHistoryContext = createContext(null)

// Tracks the sequence of top-level routes actually visited inside the app,
// independent of the browser's own session history — a PWA opened fresh (or
// from the home screen) has no reliable "previous page" outside the app
// itself, so navigate(-1) isn't safe to rely on for a back button that has
// to always land on the tab you were actually just on.
export function NavigationHistoryProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const stackRef = useRef([])
  // Set right before goBack's own navigate() call so the location-change
  // effect below doesn't treat "arriving back at a page" as a fresh visit to
  // re-push onto the stack.
  const skipNextRef = useRef(false)

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false
      return
    }
    const stack = stackRef.current
    if (stack[stack.length - 1] !== location.pathname) {
      stack.push(location.pathname)
      if (stack.length > 25) stack.shift()
    }
  }, [location.pathname])

  function goBack(fallback = '/') {
    const stack = stackRef.current
    if (stack[stack.length - 1] === location.pathname) stack.pop()
    const previous = stack.pop()
    skipNextRef.current = true
    navigate(previous || fallback)
  }

  return <NavigationHistoryContext.Provider value={{ goBack }}>{children}</NavigationHistoryContext.Provider>
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext)
  if (!context) {
    throw new Error('useNavigationHistory must be used within a NavigationHistoryProvider')
  }
  return context
}
