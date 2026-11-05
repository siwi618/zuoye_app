import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { SignIn } from '@/pages/SignIn'
import { SignUp } from '@/pages/SignUp'
import { Dashboard } from '@/pages/Dashboard'
import { BrowseRequests } from '@/pages/BrowseRequests'
import { NewRequest } from '@/pages/NewRequest'
import { RequestDetail } from '@/pages/RequestDetail'
import { Profile } from '@/pages/Profile'
import { Leaderboard } from '@/pages/Leaderboard'
import { Forum } from '@/pages/Forum'
import { MyRequests } from '@/pages/MyRequests'
import { MyTasks } from '@/pages/MyTasks'
import { NewPost } from '@/pages/NewPost'
import { PostDetail } from '@/pages/PostDetail'
import { ToolShell } from '@/components/tools/ToolShell'

// The toolbox and its tools are big and only some visitors open them: their code downloads when
// one is first opened, not with every page of the site.
const Toolbox = lazy(() => import('@/pages/Toolbox').then((m) => ({ default: m.Toolbox })))
const Ammeter = lazy(() => import('@/pages/tools/Ammeter').then((m) => ({ default: m.Ammeter })))
const Thermometer = lazy(() =>
  import('@/pages/tools/Thermometer').then((m) => ({ default: m.Thermometer })),
)
const Literature = lazy(() =>
  import('@/pages/tools/Literature').then((m) => ({ default: m.Literature })),
)
const LiteratureDevice = lazy(() =>
  import('@/pages/tools/LiteratureDevice').then((m) => ({ default: m.LiteratureDevice })),
)
const LiteratureWork = lazy(() =>
  import('@/pages/tools/LiteratureWork').then((m) => ({ default: m.LiteratureWork })),
)

// While a page's code is on its way the header stays and this shows below it.
const later = (page: ReactNode) => (
  <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">…</div>}>
    {page}
  </Suspense>
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/requests" element={<BrowseRequests />} />
            <Route path="/requests/new" element={<NewRequest />} />
            <Route path="/requests/:id" element={<RequestDetail />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/my-requests" element={<MyRequests />} />
            {/* The old global history page now lives in My Tasks. */}
            <Route path="/history" element={<Navigate to="/my-tasks?tab=history" replace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/forum/new" element={<NewPost />} />
            <Route path="/forum/:id" element={<PostDetail />} />
            <Route path="/tools" element={later(<Toolbox />)} />
            <Route element={<ToolShell />}>
              <Route path="/tools/ammeter" element={later(<Ammeter />)} />
            </Route>
            {/* Outside ToolShell: its settings (auto-zero) only apply to the ammeter. */}
            <Route path="/tools/thermometer" element={later(<Thermometer />)} />
            <Route path="/tools/literature" element={later(<Literature />)} />
            <Route path="/tools/literature/works/:key" element={later(<LiteratureWork />)} />
            <Route path="/tools/literature/devices/:name" element={later(<LiteratureDevice />)} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  )
}
