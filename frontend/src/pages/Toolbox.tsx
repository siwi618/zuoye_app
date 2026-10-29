import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Static list: icons live in public/tools, names in i18n `tools.items.<key>`.
const TOOLS = [{ key: 'ammeter', icon: '/tools/ammeter.svg', to: '/tools/ammeter' }]

export function Toolbox() {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('tools.title')}</h1>
        <p className="text-muted-foreground">{t('tools.subtitle')}</p>
      </header>

      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {TOOLS.map((tool) => (
          <Link
            key={tool.key}
            to={tool.to}
            className="group flex flex-col items-center gap-2 rounded-2xl p-2 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <img
              src={tool.icon}
              alt=""
              className="size-20 drop-shadow-sm transition-transform group-hover:-translate-y-0.5 group-active:scale-95"
            />
            <span className="text-sm font-medium">{t(`tools.items.${tool.key}`)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
