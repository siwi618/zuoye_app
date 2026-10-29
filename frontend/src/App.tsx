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
import { Toolbox } from '@/pages/Toolbox'
import { Ammeter } from '@/pages/tools/Ammeter'

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
            <Route path="/tools" element={<Toolbox />} />
            <Route path="/tools/ammeter" element={<Ammeter />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  )
}
