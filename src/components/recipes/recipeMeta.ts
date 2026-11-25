import type { ComponentType, SVGProps } from 'react'
import { Camera, Globe, PenLine, Sparkles } from 'lucide-react'
import type { RecipeCategory, RecipeRow, SourcePlatform } from '../../lib/supabase'
import { InstagramIcon } from './InstagramIcon'

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = [
  'Śniadanie',
  'Obiad',
  'Kolacja',
  'Deser',
  'Przekąska',
  'Napój',
  'Wypieki',
]

export interface SourceBadgeMeta {
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const SOURCE_BADGE_MAP: Record<SourcePlatform, SourceBadgeMeta> = {
  instagram: { label: 'Instagram', Icon: InstagramIcon },
  web: { label: 'WWW', Icon: Globe },
  photo: { label: 'Zdjęcie', Icon: Camera },
  manual: { label: 'Własny', Icon: PenLine },
  ai: { label: 'Szef AI', Icon: Sparkles },
}

export function getSourceMeta(platform: SourcePlatform | null): SourceBadgeMeta {
  if (platform && platform in SOURCE_BADGE_MAP) {
    return SOURCE_BADGE_MAP[platform]
  }
  return SOURCE_BADGE_MAP.manual
}

export function formatTimerLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} s`
  if (secs === 0) return `${mins} min`
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * Sprawdza, czy przepis należy do zakładki Pizza (wyliczany lub otagowany jako pizza).
 */
export function isPizzaRecipe(recipe: Pick<RecipeRow, 'category' | 'title' | 'tags'>): boolean {
  const category = (recipe.category ?? '').toLowerCase()
  const title = (recipe.title ?? '').toLowerCase()
  const tags = Array.isArray(recipe.tags) ? recipe.tags.map((t) => (t ?? '').toLowerCase()) : []
  return (
    category === 'pizza' ||
    category === 'pizze' ||
    tags.includes('pizza') ||
    tags.some(
      (t) =>
        t.includes('pizza') ||
        t.includes('napoletana') ||
        t.includes('rzymska') ||
        t.includes('canotto'),
    ) ||
    title.includes('pizza')
  )
}

/**
 * Sprawdza, czy przepis należy do zakładki Nalewki.
 */
export function isTinctureRecipe(recipe: Pick<RecipeRow, 'category' | 'title' | 'tags'>): boolean {
  const category = (recipe.category ?? '').toLowerCase()
  const title = (recipe.title ?? '').toLowerCase()
  const tags = Array.isArray(recipe.tags) ? recipe.tags.map((t) => (t ?? '').toLowerCase()) : []
  return (
    category === 'nalewka' ||
    category === 'nalewki' ||
    (category === 'napój' && (tags.includes('nalewka') || title.includes('nalewk') || title.includes('ówka'))) ||
    tags.includes('nalewka') ||
    tags.some(
      (t) =>
        t.includes('nalewk') ||
        t.includes('malinówka') ||
        t.includes('cytrynówka') ||
        t.includes('wiśniówka'),
    ) ||
    title.includes('nalewk') ||
    title.includes('ówka')
  )
}
