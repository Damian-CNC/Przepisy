let sharedAudioContext: AudioContext | null = null

interface WebkitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext
  }

  const AudioCtx =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext
  if (!AudioCtx) return null

  try {
    sharedAudioContext = new AudioCtx()
    return sharedAudioContext
  } catch {
    return null
  }
}

function scheduleBellTone(
  ctx: AudioContext,
  frequencyHz: number,
  startTime: number,
  durationSec: number,
  peakGain: number,
): void {
  const masterGain = ctx.createGain()
  masterGain.gain.setValueAtTime(0.0001, startTime)
  masterGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015)
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec)
  masterGain.connect(ctx.destination)

  // Fundamental tone
  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.setValueAtTime(frequencyHz, startTime)
  fundamental.connect(masterGain)

  // Soft octave harmonic for a warm kitchen bell timbre
  const harmonicGain = ctx.createGain()
  harmonicGain.gain.setValueAtTime(0.28, startTime)
  harmonicGain.connect(masterGain)

  const harmonic = ctx.createOscillator()
  harmonic.type = 'triangle'
  harmonic.frequency.setValueAtTime(frequencyHz * 2, startTime)
  harmonic.connect(harmonicGain)

  const stopTime = startTime + durationSec + 0.04
  fundamental.start(startTime)
  harmonic.start(startTime)
  fundamental.stop(stopTime)
  harmonic.stop(stopTime)

  fundamental.onended = () => {
    fundamental.disconnect()
    harmonic.disconnect()
    harmonicGain.disconnect()
    masterGain.disconnect()
  }
}

/**
 * Unlocks/resumes the Web Audio API context during a user gesture (e.g. starting a timer).
 * Needed on iOS Safari and mobile browsers before playing timer completion chimes later.
 */
export function unlockCookingAudio(): void {
  const ctx = getOrCreateAudioContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined)
  }

  // Play a 1-sample silent buffer so iOS Safari keeps the audio session unlocked
  try {
    const buffer = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // Ignore unlock errors on restricted platforms
  }
}

/**
 * Plays a pleasant, harmonic kitchen bell chime via Web Audio API and triggers device vibration.
 */
export function playTimerDoneChime(): void {
  try {
    navigator.vibrate?.([300, 100, 300])
  } catch {
    // Ignore vibration errors on unsupported browsers
  }

  const ctx = getOrCreateAudioContext()
  if (!ctx) return

  const playSequence = () => {
    const now = ctx.currentTime + 0.02
    // Pleasant major triad chime repeated softly twice (C6 - E6 - G6, then G6 - C7)
    const notes: ReadonlyArray<{ freq: number; offset: number; duration: number; gain: number }> = [
      { freq: 1046.5, offset: 0, duration: 0.65, gain: 0.2 },
      { freq: 1318.51, offset: 0.16, duration: 0.7, gain: 0.18 },
      { freq: 1567.98, offset: 0.32, duration: 0.9, gain: 0.22 },
      { freq: 1567.98, offset: 0.85, duration: 0.6, gain: 0.16 },
      { freq: 2093.0, offset: 1.01, duration: 1.05, gain: 0.2 },
    ]

    for (const note of notes) {
      scheduleBellTone(ctx, note.freq, now + note.offset, note.duration, note.gain)
    }
  }

  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        playSequence()
      })
      .catch(() => undefined)
    return
  }

  playSequence()
}
