import type { ComponentType, SVGProps } from 'react'
import { Camera, Globe, PenLine } from 'lucide-react'
import type { RecipeCategory, SourcePlatform } from '../../lib/supabase'
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
