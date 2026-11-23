import { useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { GlassButton, GlassCard, GlassModal } from '../ui'
import type { TinctureFruitId } from './tincturePresets'
import { TINCTURE_PRESETS } from './tincturePresets'
import {
  DEFAULT_SUGAR_PROFILES,
  saveTinctureSugarProfiles,
  type TinctureSugarProfiles,
} from './tinctureStorage'

export interface TinctureSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentProfiles: TinctureSugarProfiles
  onUpdateProfiles: (updated: TinctureSugarProfiles) => void
}

function getSweetnessLabel(grams: number): { label: string; color: string } {
  if (grams <= 220) return { label: 'Wytrawna / mało słodka', color: 'text-sky-600 dark:text-sky-400' }
  if (grams <= 350) return { label: 'Klasyczna półsłodka', color: 'text-amber-600 dark:text-amber-400' }
  if (grams <= 450) return { label: 'Słodka deserowa', color: 'text-rose-600 dark:text-rose-400' }
  return { label: 'Likierowa / bardzo słodka', color: 'text-purple-600 dark:text-purple-400' }
}

export function TinctureSettingsModal({
  isOpen,
  onClose,
  currentProfiles,
  onUpdateProfiles,
}: TinctureSettingsModalProps) {
  const [profiles, setProfiles] = useState<TinctureSugarProfiles>(currentProfiles)

  const handleSliderChange = (id: TinctureFruitId, val: number) => {
    setProfiles((prev) => ({ ...prev, [id]: val }))
  }

  const handleReset = () => {
    setProfiles(DEFAULT_SUGAR_PROFILES)
    saveTinctureSugarProfiles(DEFAULT_SUGAR_PROFILES)
    onUpdateProfiles(DEFAULT_SUGAR_PROFILES)
  }

  const handleSaveAndClose = () => {
    saveTinctureSugarProfiles(profiles)
    onUpdateProfiles(profiles)
    onClose()
  }

  const fruitList: TinctureFruitId[] = ['malina', 'cytryna', 'wisnia', 'wlasna']

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={handleSaveAndClose}
      title="Profile słodkości nalewek"
      subtitle="Dostosuj gramaturę cukru na 1 kg owoców do własnych upodobań smakowych."
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <GlassButton
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<RotateCcw className="size-3.5" />}
            onClick={handleReset}
          >
            Domyślne
          </GlassButton>
          <GlassButton
            type="button"
            variant="primary"
            size="md"
            onClick={handleSaveAndClose}
          >
            Zapisz ustawienia
          </GlassButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2.5">
          <Sparkles className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <p>
            Ustawienia są zapamiętywane w Twoim telefonie. Jeśli w poprzednim sezonie nalewka wyszła np. za słodka, zmniejsz suwak – od teraz kalkulator będzie domyślnie liczył według Twojej nowej proporcji!
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {fruitList.map((fruitId) => {
            const preset = TINCTURE_PRESETS[fruitId]
            const currentSugar = profiles[fruitId] ?? preset.defaultSugarGramsPerKg
            const { label, color } = getSweetnessLabel(currentSugar)

            return (
              <GlassCard key={fruitId} variant="default" padding="sm" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                      {preset.name}
                    </p>
                    <p className={`text-xs font-medium ${color}`}>{label}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 bg-stone-950/5 dark:bg-white/5 px-2.5 py-1 rounded-xl">
                    <span className="text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      {currentSugar}
                    </span>
                    <span className="text-xs text-stone-500">g / kg</span>
                  </div>
                </div>

                {/* Suwak regulacji */}
                <div className="pt-1">
                  <input
                    type="range"
                    min={preset.sugarRange.min}
                    max={preset.sugarRange.max}
                    step={preset.sugarRange.step}
                    value={currentSugar}
                    onChange={(e) => handleSliderChange(fruitId, Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-stone-600 dark:text-stone-400 font-mono mt-0.5">
                    <span>{preset.sugarRange.min} g (wytrawna)</span>
                    <span>{preset.sugarRange.max} g (likier)</span>
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      </div>
    </GlassModal>
  )
}
