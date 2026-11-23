import { ChefHat, Pizza, Wine } from 'lucide-react'
import { cn } from '../ui'

export type NavigationTab = 'recipes' | 'pizza' | 'tinctures'

export interface BottomTabBarProps {
  activeTab: NavigationTab
  onSelectTab: (tab: NavigationTab) => void
  hidden?: boolean
}

interface TabItem {
  id: NavigationTab
  label: string
  icon: typeof ChefHat
  badge?: string
}

const TABS: TabItem[] = [
  {
    id: 'recipes',
    label: 'Przepisy',
    icon: ChefHat,
  },
  {
    id: 'pizza',
    label: 'Kalkulator Pizzy',
    icon: Pizza,
  },
  {
    id: 'tinctures',
    label: 'Nalewki',
    icon: Wine,
  },
]

export function BottomTabBar({ activeTab, onSelectTab, hidden = false }: BottomTabBarProps) {
  if (hidden) return null

  return (
    <nav
      aria-label="Nawigacja główna aplikacji"
      className={cn(
        'fixed bottom-0 inset-x-0 z-40',
        'border-t border-stone-200/70 bg-white/80 backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/85',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2',
        'shadow-[0_-8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.3)]',
        'transition-transform duration-300',
      )}
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-4">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1.5 px-2 transition-all duration-200 cursor-pointer select-none',
                isActive
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200',
              )}
            >
              {/* Efekt podświetlenia aktywnej zakładki (Liquid Glass Pill) */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-2xl bg-amber-500/10 dark:bg-amber-400/15"
                />
              )}

              {/* Ikona */}
              <div
                className={cn(
                  'relative flex size-6 items-center justify-center transition-transform duration-200',
                  isActive ? 'scale-110' : 'group-hover:scale-105',
                )}
              >
                <Icon className="size-5.5" strokeWidth={isActive ? 2.3 : 1.8} />
              </div>

              {/* Etykieta */}
              <span
                className={cn(
                  'relative text-[11px] font-medium tracking-tight transition-colors duration-200',
                  isActive ? 'font-bold' : 'font-medium',
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
