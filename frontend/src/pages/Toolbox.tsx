import { useTranslation } from 'react-i18next'
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
    ],
  },
]

export function Toolbox() {
  const { t } = useTranslation()

  return (
    <div className="tbx space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('tools.title')}</h1>
        <p className="text-muted-foreground">{t('tools.subtitle')}</p>
      </header>
      <GrowthScene subjects={CATEGORIES} />
    </div>
  )
}
