import { cn } from './cn'

export interface ChefHatLoaderProps {
  className?: string
}

/**
 * Animowana czapka kucharska rysująca się jedną linią od lewego dolnego rogu.
 */
export function ChefHatLoader({ className }: ChefHatLoaderProps) {
  return (
    <div className={cn('flex items-center justify-center text-amber-700 dark:text-amber-300', className)}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="size-28 sm:size-32"
      >
        {/* Subtelny ślad linii czapki */}
        <path
          d="M 28 72 L 25 55 C 12 53, 11 31, 28 30 C 33 14, 67 14, 72 30 C 89 31, 88 53, 75 55 L 72 79 Q 50 72, 32 77"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Rysująca się linia od lewego dolnego rogu */}
        <path
          d="M 28 72 L 25 55 C 12 53, 11 31, 28 30 C 33 14, 67 14, 72 30 C 89 31, 88 53, 75 55 L 72 79 Q 50 72, 32 77"
          pathLength="100"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chef-hat-draw"
        />
      </svg>
    </div>
  )
}
