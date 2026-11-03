import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Static list by subject: icons live in public/tools, names in i18n `tools.items.<key>`,
// section titles in `tools.categories.<key>`.
const CATEGORIES = [
  { key: 'science', tools: [{ key: 'ammeter', icon: '/tools/ammeter.svg', to: '/tools/ammeter' }] },
  { key: 'humanities', tools: [] },
]

export function Toolbox() {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('tools.title')}</h1>
        <p className="text-muted-foreground">{t('tools.subtitle')}</p>
      </header>

      {CATEGORIES.map((cat) => (
        <section key={cat.key} className="space-y-4">
          <h2 className="text-lg font-semibold">{t(`tools.categories.${cat.key}`)}</h2>
          {cat.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tools.comingSoon')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {cat.tools.map((tool) => (
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
          )}
        </section>
      ))}
    </div>
  )
}
