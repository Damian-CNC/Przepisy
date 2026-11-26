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
}

const TABS: TabItem[] = [
  {
    id: 'recipes',
    label: 'Przepisy',
    icon: ChefHat,
  },
  {
    id: 'pizza',
    label: 'Pizza',
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

  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.id === activeTab),
  )

  return (
    <div
      aria-label="Dolny pasek nawigacyjny"
      className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 pointer-events-none sm:bottom-4"
    >
      <nav
        aria-label="Główne zakładki aplikacji"
        className={cn(
          'pointer-events-auto relative grid w-full max-w-sm grid-cols-3 items-center p-1.5',
          'rounded-full liquid-glass',
        )}
      >
        {/* Płynny wskaźnik aktywnej zakładki na GPU (translate3d bez przeliczania layoutu) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/3)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
          style={{ transform: `translate3d(${activeIndex * 100}%, 0, 0)` }}
        >
          <div
            className={cn(
              'size-full rounded-full',
              'bg-gradient-to-b from-amber-500/22 to-amber-600/14 dark:from-amber-400/28 dark:to-amber-500/18',
              'border border-amber-500/35 dark:border-amber-400/35',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_2px_10px_rgba(245,158,11,0.22)]',
            )}
          />
        </div>

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
                'group relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-full py-1.5 px-2.5',
                'cursor-pointer select-none transition-all duration-300 active:scale-95 outline-none',
                isActive
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100',
              )}
            >
              {/* Ikona z płynną skalą */}
              <div
                className={cn(
                  'relative flex size-6 items-center justify-center transition-transform duration-300 ease-out will-change-transform',
                  isActive ? 'scale-110' : 'scale-100 group-hover:scale-105',
                )}
              >
                <Icon
                  className="size-5 shrink-0"
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
              </div>

              {/* Etykieta */}
              <span
                className={cn(
                  'relative text-[11px] tracking-tight transition-colors duration-300',
                  isActive ? 'font-bold' : 'font-medium',
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
