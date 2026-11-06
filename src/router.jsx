import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// A tiny History-API router: the site has six flat pages, so a dependency
// would be more than it needs. Unknown paths fall back to Home (see App).
const RouterContext = createContext({ path: '/', navigate: () => {} })

const normalize = (p) => {
  const clean = (p || '/').split(/[?#]/)[0].replace(/\/+$/, '')
  return clean || '/'
}

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => normalize(window.location.pathname))

  useEffect(() => {
    const onPop = () => setPath(normalize(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to, { replace = false } = {}) => {
    const next = normalize(to)
    if (replace) window.history.replaceState(null, '', next)
    else if (next !== normalize(window.location.pathname)) window.history.pushState(null, '', next)
    setPath(next)
    // Jump, don't glide: html has smooth scrolling for in-page anchors.
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const value = useMemo(() => ({ path, navigate }), [path, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export const useRouter = () => useContext(RouterContext)

// An <a> that routes in-app on a plain left click and behaves like a normal
// link otherwise (new tab, copy link, middle click).
export function Link({ to, onClick, children, ...rest }) {
  const { path, navigate } = useRouter()
  const handleClick = (e) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={handleClick} aria-current={normalize(to) === path ? 'page' : undefined} {...rest}>
      {children}
    </a>
  )
}
