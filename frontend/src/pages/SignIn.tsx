import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRight, Languages, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/AuthShell'
import { supabase } from '@/api/supabase'

interface LocationState {
  from?: { pathname?: string }
}

export function SignIn() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      toast.success(t('auth.welcomeBack'))
      const state = location.state as LocationState | null
      const to = state?.from?.pathname ?? '/'
      navigate(to, { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.signInFailed')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('auth.welcomeBack')}</h1>
          <p className="text-muted-foreground">{t('auth.signInSubtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@school.com"
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="pl-10"
              />
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? '…' : t('auth.signIn')}
            {!submitting && <ArrowRight className="size-4" />}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              {t('auth.signUp')}
            </Link>
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() =>
              void i18n.changeLanguage(i18n.language.startsWith('zh') ? 'en' : 'zh')
            }
          >
            <Languages className="size-4" />
            {i18n.language.startsWith('zh') ? 'EN' : '中'}
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
