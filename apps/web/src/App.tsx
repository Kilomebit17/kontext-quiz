import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LiveRegion } from './components/LiveRegion'
import { Toaster } from './components/Toaster'
import { PageSpinner } from './components/Spinner'
import './stores/settingsStore'

const Landing = lazy(() => import('./pages/Landing'))
const Join = lazy(() => import('./pages/Join'))
const Play = lazy(() => import('./pages/Play'))
const HostDashboard = lazy(() => import('./pages/HostDashboard'))
const Editor = lazy(() => import('./pages/Editor'))
const HostGame = lazy(() => import('./pages/HostGame'))
const History = lazy(() => import('./pages/History'))
const HistoryDetail = lazy(() => import('./pages/HistoryDetail'))
const Challenges = lazy(() => import('./pages/Challenges'))
const Library = lazy(() => import('./pages/Library'))
const Solo = lazy(() => import('./pages/Solo'))
const Challenge = lazy(() => import('./pages/Challenge'))
const Login = lazy(() => import('./pages/Login'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  const { t } = useTranslation()
  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable rounded-lg bg-amber px-4 py-2 font-semibold text-fg-on-accent"
      >
        {t('app.skipToContent')}
      </a>
      <LiveRegion />
      <Toaster />
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/join" element={<Join />} />
          <Route path="/play" element={<Play />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="/host/quiz/new" element={<Editor />} />
          <Route path="/host/quiz/:id" element={<Editor />} />
          <Route path="/host/game/:sessionId" element={<HostGame />} />
          <Route path="/host/history" element={<History />} />
          <Route path="/host/history/:id" element={<HistoryDetail />} />
          <Route path="/host/challenges" element={<Challenges />} />
          <Route path="/library" element={<Library />} />
          <Route path="/solo/:quizId" element={<Solo />} />
          <Route path="/challenge/:code" element={<Challenge />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
