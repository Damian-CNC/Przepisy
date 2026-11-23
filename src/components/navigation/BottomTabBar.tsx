import { ChefHat, Pizza, Wine } from 'lucide-react'
import { motion } from 'framer-motion'
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
    label: 'Pizza KMP',
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
    <div
      aria-label="Dolny pasek nawigacyjny"
      className={cn(
        'fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 pointer-events-none sm:bottom-4',
        'transition-transform duration-300 motion-reduce:transition-none',
      )}
    >
      <nav
        aria-label="Główne zakładki aplikacji"
        className={cn(
          'pointer-events-auto relative flex w-full max-w-sm items-center justify-between gap-1 p-1.5',
          'rounded-full',
          // Apple Liquid Glass
          'bg-white/75 dark:bg-stone-900/80',
          'backdrop-blur-2xl backdrop-saturate-150',
          'border border-white/60 dark:border-white/15',
          'shadow-[0_12px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,0.8)]',
          'dark:shadow-[0_16px_48px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]',
        )}
      >
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
                'group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 px-2.5',
                'cursor-pointer select-none transition-colors duration-200 outline-none',
                isActive
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200',
              )}
            >
              {/* Animowana kapsuła tła aktywnej zakładki (Liquid Glass Pill) */}
              {isActive && (
                <motion.div
                  layoutId="activeBottomTabPill"
                  className={cn(
                    'absolute inset-0 rounded-full',
                    'bg-gradient-to-b from-amber-500/20 to-amber-600/15 dark:from-amber-400/25 dark:to-amber-500/20',
                    'border border-amber-500/30 dark:border-amber-400/30',
                    'shadow-[0_2px_8px_rgba(245,158,11,0.2)]',
                  )}
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}

              {/* Ikona z subtelną sprężystą skalą */}
              <motion.div
                animate={{ scale: isActive ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="relative flex size-6 items-center justify-center"
              >
                <Icon
                  className="size-5 shrink-0"
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
              </motion.div>

              {/* Etykieta */}
              <span
                className={cn(
                  'relative text-[11px] tracking-tight transition-colors duration-200',
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
