import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, GraduationCap, Mail, UserRoundPen, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RequestCard } from '@/components/RequestCard'
import { listRequests } from '@/api/requests'
import {
  changeMyName,
  MY_PROFILE_KEY,
  updateMyProfile,
  useMyProfile,
  type Grade,
} from '@/api/profile'
import { supabase } from '@/api/supabase'
import { GRADE_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { saveToolSettings, useToolSettings } from '@/lib/toolSettings'
import { useAuthStore } from '@/store/auth'

export function Profile() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const mine = useQuery({
    queryKey: ['requests', { mine: true, status: 'completed' }],
    queryFn: () => listRequests({ mine: true, status: 'completed' }),
  })

  const completed = useMemo(() => mine.data ?? [], [mine.data])
  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? user?.email
  const initials = (displayName ?? '?').toString().trim().slice(0, 2).toUpperCase()

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Card className="overflow-hidden p-0">
        <div className="relative h-28 bg-gradient-to-br from-brand-700 via-primary to-brand-600">
          <div className="absolute inset-0 bg-grid-faint opacity-25 mix-blend-soft-light" aria-hidden />
        </div>
        <CardContent className="pb-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <Avatar className="size-20 ring-4 ring-background">
              <AvatarFallback className="bg-brand-100 text-2xl font-semibold text-brand-700">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="mb-1 space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="size-3.5" />
                {user?.email ?? '—'}
              </p>
            </div>
            <div className="mb-1 ml-auto rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
              {completed.length} {t('profile.completedRequests').toLowerCase()}
            </div>
          </div>
        </CardContent>
      </Card>

      <DisplayNameCard />
      <DefaultGradeCard />
      <ToolSettingsCard />

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="size-4.5" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight">{t('profile.completedRequests')}</h2>
        </div>
        {mine.isLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : mine.isError ? (
          <p className="text-destructive">
            {mine.error instanceof Error ? mine.error.message : t('common.error')}
          </p>
        ) : completed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
            {t('profile.noCompleted')}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// Toolbox settings; tools link here as /profile#tool-settings.
function ToolSettingsCard() {
  const { t } = useTranslation()
  const { hash } = useLocation()
  const settings = useToolSettings()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (hash === '#tool-settings')
      document
        .getElementById('tool-settings')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hash])

  const toggle = async () => {
    const on = !settings.autoZero
    setSaving(true)
    try {
      await saveToolSettings({ auto_zero: on })
      toast.success(t(on ? 'profile.autoZeroOn' : 'profile.autoZeroOff'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('profile.autoZeroSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card id="tool-settings" className={cn(hash === '#tool-settings' && 'border-primary/60')}>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-56 flex-1 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <Wrench className="size-4.5" />
          </span>
          <div className="space-y-1">
            <Label htmlFor="auto-zero" className="text-base font-semibold">
              {t('profile.autoZero')}
            </Label>
            <p className="text-sm text-muted-foreground">{t('profile.autoZeroHint')}</p>
          </div>
        </div>
        <button
          id="auto-zero"
          type="button"
          role="switch"
          aria-checked={settings.autoZero}
          onClick={toggle}
          disabled={!settings.loaded || saving}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
            settings.autoZero ? 'bg-primary' : 'bg-input dark:bg-input/80',
          )}
        >
          <span
            className={cn(
              'block size-5 rounded-full bg-background shadow-sm transition-transform',
              settings.autoZero ? 'translate-x-5.5' : 'translate-x-0.5',
            )}
          />
        </button>
      </CardContent>
    </Card>
  )
}

function DefaultGradeCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const profile = useMyProfile()
  const saved = profile.data?.grade ?? null
  // null = untouched, follow the saved value
  const [picked, setPicked] = useState<Grade | null>(null)
  const value = picked ?? saved

  const mutation = useMutation({
    mutationFn: (grade: Grade) => updateMyProfile({ grade }),
    onSuccess: (data) => {
      queryClient.setQueryData(MY_PROFILE_KEY, data)
      setPicked(null)
      toast.success(t('profile.gradeSaved'))
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('profile.gradeSaveFailed'))
    },
  })

  const unset = profile.isSuccess && !saved

  return (
    <Card className={cn(unset && 'border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-900/20')}>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-56 flex-1 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <GraduationCap className="size-4.5" />
          </span>
          <div className="space-y-1">
            <Label htmlFor="default-grade" className="text-base font-semibold">
              {t('profile.defaultGrade')}
            </Label>
            <p className={cn('text-sm', unset ? 'text-amber-800 dark:text-amber-100' : 'text-muted-foreground')}>
              {unset ? t('profile.gradeReminder') : t('profile.defaultGradeHint')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={value ?? ''}
            onValueChange={(v) => setPicked(v as Grade)}
            disabled={profile.isLoading}
          >
            <SelectTrigger id="default-grade" className="w-40">
              <SelectValue placeholder={t('profile.defaultGradeNone')} />
            </SelectTrigger>
            <SelectContent>
              {GRADE_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {t(`grades.${g}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => value && mutation.mutate(value)}
            disabled={!value || value === saved || mutation.isPending}
          >
            {mutation.isPending ? '…' : t('profile.saveGrade')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DisplayNameCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const profile = useMyProfile()
  const saved = profile.data?.display_name ?? ''
  const nextChange = profile.data?.next_name_change_at ?? null
  // null = untouched, follow the saved value
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? saved

  const mutation = useMutation({
    mutationFn: (name: string) => changeMyName(name),
    onSuccess: (data) => {
      queryClient.setQueryData(MY_PROFILE_KEY, data)
      setDraft(null)
      // The header reads the name from the session; fetch the updated one.
      void supabase.auth.refreshSession()
      toast.success(t('profile.nameSaved'))
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    },
  })

  const locked = Boolean(nextChange)
  const trimmed = value.trim()

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-56 flex-1 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <UserRoundPen className="size-4.5" />
          </span>
          <div className="space-y-1">
            <Label htmlFor="display-name" className="text-base font-semibold">
              {t('profile.displayName')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {locked
                ? t('profile.nextNameChange', {
                    date: new Date(nextChange!).toLocaleDateString(),
                  })
                : t('profile.displayNameHint')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="display-name"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            disabled={profile.isLoading || locked}
            maxLength={50}
            className="w-48"
          />
          <Button
            onClick={() => mutation.mutate(trimmed)}
            disabled={locked || !trimmed || trimmed === saved || mutation.isPending}
          >
            {mutation.isPending ? '…' : t('profile.saveName')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
