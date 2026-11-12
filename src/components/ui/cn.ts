/**
 * Joins conditional CSS class names into a single space-delimited string.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

const BARE_DISPLAY_CLASS_RE =
  /(?:^|\s)(?:hidden|block|inline-block|inline|flex|inline-flex|grid|inline-grid|contents)(?=\s|$)/

/**
 * Checks whether caller `className` specifies an unprefixed CSS `display` utility
 * (e.g. `hidden`) so base `inline-flex` does not override it in CSS cascade order.
 */
export function hasExplicitDisplayClass(className?: string): boolean {
  return typeof className === 'string' && BARE_DISPLAY_CLASS_RE.test(className)
}
