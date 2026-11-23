import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCouncil, useGuideEvents } from '@/api/guide'
import type { Subject } from '@/components/toolbox/types'
import { GrowthScene } from '@/components/toolbox/GrowthScene'
import '@/components/toolbox/toolbox.css'

// Static list by subject: icons live in public/tools, names in i18n `tools.items.<key>`,
// one-line descriptions in `tools.blurbs.<key>`, section titles in `tools.categories.<key>`.
// Each tool becomes a branch tip on the coral; a subject with no tools keeps a bare branch.
const CATEGORIES: Subject[] = [
  {
    key: 'science',
    tools: [
      { key: 'ammeter', status: 'live', icon: '/tools/ammeter.svg', to: '/tools/ammeter' },
      {
        key: 'thermometer',
        status: 'live',
        icon: '/tools/thermometer.svg',
        to: '/tools/thermometer',
      },
    ],
  },
  {
    key: 'humanities',
    tools: [
      { key: 'literature', status: 'live', icon: '/tools/literature.svg', to: '/tools/literature' },
      // 「活动指南」 sits here until the coral gets a branch that suits it. Shown only to the
      // student council, and to everyone on days an event is open (see Toolbox below).
      { key: 'guide', status: 'live', icon: '/tools/guide.svg', to: '/tools/guide' },
    ],
  },
]

export function Toolbox() {
  const { t } = useTranslation()
  const council = useCouncil()
  const open = useGuideEvents()
  const showGuide = !!council.data?.role || (open.data?.length ?? 0) > 0
  const subjects = useMemo(
    () =>
      showGuide
        ? CATEGORIES
        : CATEGORIES.map((s) => ({ ...s, tools: s.tools.filter((x) => x.key !== 'guide') })),
    [showGuide],
  )

  return (
    <div className="tbx space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('tools.title')}</h1>
        <p className="text-muted-foreground">{t('tools.subtitle')}</p>
      </header>
      <GrowthScene subjects={subjects} />
    </div>
  )
}
