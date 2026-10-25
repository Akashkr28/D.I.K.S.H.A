// The sound of D.I.K.S.H.A waking up. It's built from a few tones on the spot,
// so there's no audio file to download and nothing to license.

import { audioContext } from './voice'

export function playWakeSound() {
  const audio = audioContext()
  if (!audio) return
  const now = audio.currentTime

  const out = audio.createGain()
  out.gain.value = 0.16 // present, but never startling
  out.connect(audio.destination)

  // a low hum that rises, like something powering up
  const hum = audio.createOscillator()
  const humLevel = audio.createGain()
  hum.type = 'sine'
  hum.frequency.setValueAtTime(82, now)
  hum.frequency.exponentialRampToValueAtTime(196, now + 1.1)
  humLevel.gain.setValueAtTime(0.0001, now)
  humLevel.gain.exponentialRampToValueAtTime(0.9, now + 0.5)
  humLevel.gain.exponentialRampToValueAtTime(0.0001, now + 1.5)
  hum.connect(humLevel).connect(out)
  hum.start(now)
  hum.stop(now + 1.6)

  // three soft bell tones arriving one after another, forming an open chord
  const notes = [392, 587.33, 880] // G4, D5, A5
  notes.forEach((frequency, index) => {
    const start = now + 0.35 + index * 0.14
    const tone = audio.createOscillator()
    const level = audio.createGain()
    tone.type = 'sine'
    tone.frequency.value = frequency
    level.gain.setValueAtTime(0.0001, start)
    level.gain.exponentialRampToValueAtTime(0.5, start + 0.04)
    level.gain.exponentialRampToValueAtTime(0.0001, start + 1.3)
    tone.connect(level).connect(out)
    tone.start(start)
    tone.stop(start + 1.4)
  })

  // a breath of air sweeping upward underneath
  const length = Math.floor(audio.sampleRate * 1.2)
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const air = audio.createBufferSource()
  air.buffer = buffer
  const sweep = audio.createBiquadFilter()
  sweep.type = 'bandpass'
  sweep.Q.value = 1.2
  sweep.frequency.setValueAtTime(300, now)
  sweep.frequency.exponentialRampToValueAtTime(5000, now + 1)
  const airLevel = audio.createGain()
  airLevel.gain.setValueAtTime(0.0001, now)
  airLevel.gain.exponentialRampToValueAtTime(0.25, now + 0.6)
  airLevel.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
  air.connect(sweep).connect(airLevel).connect(out)
  air.start(now)
}
