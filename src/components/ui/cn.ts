/**
 * Joins conditional CSS class names into a single space-delimited string.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
