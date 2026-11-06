import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPeriod } from './config'
import { useCountdown } from './hooks/useCountdown'
import { AuthProvider } from './hooks/useAuth'
import { PlayerProvider } from './hooks/usePlayer'
import { useToast } from './hooks/useToast'
import { RouterProvider, useRouter } from './router'
import { initAnalytics, trackPage } from './analytics'
import { applyMeta } from './meta'
import ConsentBanner from './components/ConsentBanner'
import { UIContext } from './ui'
import TopBar from './components/TopBar'
import SideNav from './components/SideNav'
import Footer from './components/Footer'
import RulesModal from './components/RulesModal'
import PlayerModal from './components/PlayerModal'
import TicketModal from './components/TicketModal'
import WinnersModal from './components/WinnersModal'
import Toast from './components/Toast'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import MilestonesPage from './pages/MilestonesPage'
import BonusesPage from './pages/BonusesPage'
import StorePage from './pages/StorePage'
import ReferPage from './pages/ReferPage'
import SignUpPage from './pages/SignUpPage'
import { lazyPage } from './lazyPage'
import PageError from './components/PageError'
// three.js only loads with the raffle page
const RafflesPage = lazyPage(() => import('./pages/RafflesPage'))
const AdminPage = lazyPage(() => import('./pages/AdminPage'))
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'))
const BonusHuntPage = lazyPage(() => import('./pages/BonusHuntPage'))
const GuessPage = lazyPage(() => import('./pages/GuessPage'))
const TournamentsPage = lazyPage(() => import('./pages/TournamentsPage'))
const ChallengesPage = lazyPage(() => import('./pages/ChallengesPage'))
const SlotPickerPage = lazyPage(() => import('./pages/SlotPickerPage'))
const GiveawaysPage = lazyPage(() => import('./pages/GiveawaysPage'))
const LegalPage = lazyPage(() => import('./pages/LegalPage'))
const VipsPage = lazyPage(() => import('./pages/VipsPage'))
const SocialsPage = lazyPage(() => import('./pages/SocialsPage'))
const BigWinsPage = lazyPage(() => import('./pages/BigWinsPage'))
const ContactPage = lazyPage(() => import('./pages/ContactPage'))
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'))

// GA starts here only if the visitor already allowed it on an earlier visit
initAnalytics()

const PAGES = {
  '/': HomePage,
  '/leaderboard': LeaderboardPage,
  '/biggest-wins': BigWinsPage,
  '/milestones': MilestonesPage,
  '/bonuses': BonusesPage,
  '/store': StorePage,
  '/raffles': RafflesPage,
  '/giveaways': GiveawaysPage,
  '/vips': VipsPage,
  '/bonus-hunt': BonusHuntPage,
  '/guess-the-balance': GuessPage,
  '/tournaments': TournamentsPage,
  '/challenges': ChallengesPage,
  '/slot-picker': SlotPickerPage,
  '/refer': ReferPage,
  '/how-to-sign-up': SignUpPage,
  '/socials': SocialsPage,
  '/contact': ContactPage,
  '/admin': AdminPage, // not in the side nav (routes.js)
  '/profile': ProfilePage, // not in the side nav (routes.js)
  // linked from the footer
  '/terms': LegalPage,
  '/privacy': LegalPage,
  '/responsible-gambling': LegalPage,
}

function Shell() {
  const { path } = useRouter()
  const [navOpen, setNavOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [ticket, setTicket] = useState(null)
  const [winners, setWinners] = useState(null)
  const [toast, showToast] = useToast()
  const period = getPeriod()
  const countdown = useCountdown(period.endAt)

  // Stable across the 1s countdown re-renders so dialog effects don't churn.
  const closeNav = useCallback(() => setNavOpen(false), [])
  const closeRules = useCallback(() => setRulesOpen(false), [])
  const closePlayer = useCallback(() => setPlayerOpen(false), [])
  const closeTicket = useCallback(() => setTicket(null), [])
  const closeWinners = useCallback(() => setWinners(null), [])

  const ui = useMemo(
    () => ({
      toast: showToast,
      openRules: () => setRulesOpen(true),
      openPlayer: () => {
        setNavOpen(false)
        setPlayerOpen(true)
      },
      openTicket: setTicket,
      openWinners: setWinners,
    }),
    [showToast],
  )

  // an unknown address shows the 404 page (the server also answers it with status 404)
  const Page = PAGES[path] || NotFoundPage

  // the page's title, description, canonical and share tags (src/seo.js), then one
  // analytics page view if the visitor allowed analytics (src/analytics.js)
  useEffect(() => {
    applyMeta(path)
    trackPage()
  }, [path])

  // After an in-app navigation, move focus to the new page (not on first load)
  // so keyboard and screen-reader users start at its content.
  const mainRef = useRef()
  const firstRoute = useRef(true)
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
  }, [path])

  return (
    <UIContext.Provider value={ui}>
      <div className="app">
        <TopBar countdown={countdown} onMenu={() => setNavOpen(true)} navOpen={navOpen} />
        <SideNav open={navOpen} onClose={closeNav} />
        {navOpen && <div className="nav-scrim" onClick={closeNav} />}

        {/* Keyed by path so each page plays its entrance on arrival. */}
        <main className="main" key={path} ref={mainRef} tabIndex={-1}>
          {/* grows to fill the screen, so the footer sits at the bottom of short pages */}
          <div className="main-page">
            <PageError key={path}>
              <Suspense fallback={null}>
                <Page countdown={countdown} />
              </Suspense>
            </PageError>
          </div>
          <Footer />
        </main>

        <RulesModal open={rulesOpen} onClose={closeRules} period={period} />
        <PlayerModal open={playerOpen} onClose={closePlayer} />
        <TicketModal ticket={ticket} onClose={closeTicket} />
        <WinnersModal board={winners} onClose={closeWinners} />
        <Toast visible={toast.visible}>{toast.content}</Toast>
        <ConsentBanner />
      </div>
    </UIContext.Provider>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <PlayerProvider>
          <Shell />
        </PlayerProvider>
      </AuthProvider>
    </RouterProvider>
  )
}
