import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Award,
  BookMarked,
  CheckCircle2,
  Feather,
  GraduationCap,
  Mail,
  Ticket,
  UserRoundPen,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
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
  MY_BADGES_KEY,
  MY_PROFILE_KEY,
  redeemBadgeCode,
  updateMyProfile,
  useMyBadges,
  useMyProfile,
  type BadgeKey,
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
  const [editingName, setEditingName] = useState(false)
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
              <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
                <button
                  type="button"
                  onClick={() => setEditingName((v) => !v)}
                  aria-label={t('profile.editName')}
                  aria-expanded={editingName}
                  title={t('profile.editName')}
                  className={cn(
                    'grid size-7 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-brand-100 hover:text-brand-700 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    editingName && 'bg-brand-100 text-brand-700',
                  )}
                >
                  <Feather className="size-4" />
                </button>
              </div>
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

      {editingName && <DisplayNameCard onClose={() => setEditingName(false)} />}
      <BadgeWall />
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

const BADGE_ICONS: Record<BadgeKey, LucideIcon> = {
  lead_reader: BookMarked,
}

// The badges the user holds. Badges are given with one-time codes (CORAL-XXXX-XXXX), redeemed
// here; some also allow something, e.g. 「领读人」 adds works to the literature tool.
function BadgeWall() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const badges = useMyBadges()
  const [redeeming, setRedeeming] = useState(false)
  const [code, setCode] = useState('')
  const [fresh, setFresh] = useState<string | null>(null) // just redeemed: shown with a flourish
  const shown = (badges.data ?? []).filter((b): b is typeof b & { key: BadgeKey } => b.key in BADGE_ICONS)

  const redeem = useMutation({
    mutationFn: () => redeemBadgeCode(code),
    onSuccess: (all) => {
      const before = new Set((badges.data ?? []).map((b) => b.key))
      const added = all.find((b) => !before.has(b.key))
      queryClient.setQueryData(MY_BADGES_KEY, all)
      setRedeeming(false)
      setCode('')
      if (added && added.key in BADGE_ICONS) {
        setFresh(added.key)
        toast.success(t('profile.badgeRedeemed', { name: t(`profile.badges.${added.key as BadgeKey}.name`) }))
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('common.error')),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (code.trim() && !redeem.isPending) redeem.mutate()
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <Award className="size-4.5" />
          </span>
          <h2 className="text-base font-semibold">{t('profile.badgeWall')}</h2>
          {!redeeming && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setRedeeming(true)}>
              <Ticket className="size-4" />
              {t('profile.redeemBadge')}
            </Button>
          )}
        </div>

        {redeeming && (
          <form onSubmit={submit} className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Escape' && setRedeeming(false)}
              placeholder={t('profile.redeemPlaceholder')}
              aria-label={t('profile.redeemBadge')}
              maxLength={20}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-52 font-mono tracking-wider"
            />
            <Button type="submit" disabled={!code.trim() || redeem.isPending}>
              {redeem.isPending ? '…' : t('profile.redeemSubmit')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRedeeming(false)}>
              {t('common.cancel')}
            </Button>
          </form>
        )}

        {badges.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : shown.length ? (
          <ul className="flex flex-wrap gap-3">
            {shown.map((b) => {
              const Icon = BADGE_ICONS[b.key]
              return (
                <li
                  key={b.key}
                  className={cn(
                    'flex w-64 items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-card p-3 dark:border-brand-700/40 dark:from-brand-700/15',
                    fresh === b.key && 'animate-in zoom-in-90 fade-in duration-500',
                  )}
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-sm ring-4 ring-brand-100 dark:ring-brand-700/40">
                    <Icon className="size-5.5" />
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold">{t(`profile.badges.${b.key}.name`)}</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(`profile.badges.${b.key}.desc`)}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">
                      {t('profile.badgeGranted', {
                        date: new Date(b.granted_at).toLocaleDateString(i18n.language),
                      })}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            <p>{t('profile.badgeWallEmpty')}</p>
            <p className="mt-1 text-xs">{t('profile.badgeWallHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
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

function DisplayNameCard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
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
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    },
  })

  const locked = Boolean(nextChange)
  const trimmed = value.trim()

  useEffect(() => {
    if (!locked && !profile.isLoading) inputRef.current?.focus()
  }, [locked, profile.isLoading])

  return (
    <Card className="relative animate-in fade-in slide-in-from-top-2 duration-200">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
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
            ref={inputRef}
            id="display-name"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (
                e.key === 'Enter' &&
                !e.nativeEvent.isComposing &&
                !locked &&
                trimmed &&
                trimmed !== saved &&
                !mutation.isPending
              )
                mutation.mutate(trimmed)
            }}
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
