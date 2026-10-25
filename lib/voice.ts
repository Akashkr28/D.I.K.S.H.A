// Her speaking voice. Each sentence goes to /api/tts, which returns real audio from a
// text-to-speech service. If the service isn't set up or fails, we fall back to the
// browser's built-in voice so she never goes silent.

import { pickVoice } from './speech'

// softness runs from 0 (the voice as recorded) to 1 (slowest, quietest, most mellow)
export type VoiceOptions = { voiceId: string; softness: number }
let options: VoiceOptions = { voiceId: '', softness: 0.6 }

let audio: AudioContext | null = null
let analyser: AnalyserNode | null = null
let mellow: BiquadFilterNode | null = null // takes the sharp edge off the high frequencies
let volume: GainNode | null = null

function applySoftness() {
  if (!audio || !mellow || !volume) return
  mellow.gain.setTargetAtTime(-12 * options.softness, audio.currentTime, 0.05)
  volume.gain.setTargetAtTime(1 - 0.35 * options.softness, audio.currentTime, 0.05)
}

export function setVoiceOptions(next: VoiceOptions) {
  options = next
  applySoftness()
}

// must be called from a click, or the browser keeps the audio muted
export function unlockAudio() {
  if (!audio) {
    audio = new AudioContext()
    mellow = audio.createBiquadFilter()
    mellow.type = 'highshelf'
    mellow.frequency.value = 3200
    volume = audio.createGain()
    analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    // clip → mellow → volume → analyser → speakers
    mellow.connect(volume)
    volume.connect(analyser)
    analyser.connect(audio.destination)
    applySoftness()
  }
  void audio.resume()
}

// for sound effects that share the same audio output as her voice
export const audioContext = () => audio

async function fetchSpeech(text: string, url?: string): Promise<AudioBuffer | null> {
  if (!audio) return null
  try {
    // a url means the line is already recorded; otherwise have it spoken fresh
    const res = url
      ? await fetch(url)
      : await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: options.voiceId || undefined,
            speed: 1 - 0.2 * options.softness, // softer also means a little slower
          }),
        })
    if (!res.ok) return null
    return await audio.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}

function browserSay(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'en-IN'
    utterance.rate = 0.88
    utterance.pitch = 1.2
    utterance.volume = 0.8
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

// url: play a recording instead of generating speech. onStart: runs as this line begins,
// with its length in seconds when known (null for the browser voice, which can't tell us).
export type Line = { url?: string; onStart?: (seconds: number | null) => void }

export type Speaker = {
  // resolves once this line has been spoken, or skipped by stop()
  enqueue(text: string, line?: Line): Promise<void>
  stop(): void
  energy(): number | null
}

export function createSpeaker(events: { onStart(): void; onIdle(): void }): Speaker {
  let queue: Promise<void> = Promise.resolve()
  let pending = 0
  let run = 0 // bumped by stop() so anything already queued knows to skip itself
  let source: AudioBufferSourceNode | null = null
  const samples = new Uint8Array(1024)

  function play(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      if (!audio || !mellow) return resolve()
      const node = audio.createBufferSource()
      node.buffer = buffer
      node.connect(mellow)
      node.onended = () => {
        if (source === node) source = null
        resolve()
      }
      source = node
      node.start()
    })
  }

  return {
    enqueue(text, line = {}) {
      const mine = run
      const speech = fetchSpeech(text, line.url) // start fetching now so it's ready when its turn comes
      pending++
      queue = queue
        .then(async () => {
          if (mine !== run) return
          const buffer = await speech
          if (mine !== run) return
          // a paused context (no click yet) never finishes a clip, which would stall the queue
          const playable = !!buffer && audio?.state === 'running'
          events.onStart()
          line.onStart?.(playable && buffer ? buffer.duration : null)
          if (playable && buffer) await play(buffer)
          else await browserSay(text)
        })
        .catch(() => {})
        .then(() => {
          pending--
          if (pending === 0) events.onIdle()
        })
      return queue
    },

    stop() {
      run++
      try {
        source?.stop()
      } catch {}
      window.speechSynthesis?.cancel()
    },

    // how loud she is right now, from 0 to 1. null when the browser voice is speaking,
    // because that audio can't be measured.
    energy() {
      if (!source || !analyser) return null
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) {
        const centred = (sample - 128) / 128
        sum += centred * centred
      }
      // typical speech sits around 0.1 to 0.2 here, so scale it up to use the full range
      return Math.min(1, Math.sqrt(sum / samples.length) * 5)
    },
  }
}
