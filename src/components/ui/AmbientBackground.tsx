import { cn } from './cn'

export interface AmbientBackgroundProps {
  /** Additional CSS classes for the ambient layer container. */
  className?: string
}

/**
 * Warm culinary Ambient Mesh backdrop that shines softly through Liquid Glass panels.
 * Automatically adapts between light (sage, peach, cream) and dark (graphite, emerald, amber).
 */
export function AmbientBackground({ className }: AmbientBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#fbf8f3] dark:bg-zinc-950',
        className,
      )}
    >
      {/* Top-left sage / emerald culinary glow */}
      <div
        className={cn(
          'ambient-blob-a absolute -top-28 -left-24 h-[32rem] w-[32rem] rounded-full blur-[100px]',
          'bg-emerald-200/50 dark:bg-emerald-900/25',
          'pointer-events-none',
        )}
      />

      {/* Center-right warm peach / amber glow */}
      <div
        className={cn(
          'ambient-blob-b absolute top-1/4 -right-28 h-[36rem] w-[36rem] rounded-full blur-[110px]',
          'bg-orange-200/45 dark:bg-amber-800/20',
          'pointer-events-none',
        )}
      />

      {/* Bottom-center creamy vanilla / deep sage anchor */}
      <div
        className={cn(
          'ambient-blob-c absolute -bottom-32 left-1/4 h-[30rem] w-[38rem] rounded-full blur-[100px]',
          'bg-amber-100/60 dark:bg-teal-950/35',
          'pointer-events-none',
        )}
      />

      {/* Subtle radial sheen for depth */}
      <div
        className={cn(
          'absolute inset-0',
          'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_60%)]',
          'dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_60%)]',
        )}
      />
    </div>
  )
}
