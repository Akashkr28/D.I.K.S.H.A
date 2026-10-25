'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import ThreeDPresence, { type PresenceState } from './ThreeDPresence'
import Caption from './Caption'
import { createRecognizer, takeSentences, type Recognizer } from '@/lib/speech'
import { createSpeaker, setVoiceOptions, unlockAudio, type Speaker } from '@/lib/voice'
import { loadEmotionModels, detectUserEmotion } from '@/lib/emotion'

type Message = { role: 'user' | 'assistant'; content: string }
type Memory = { id: string; text: string }
type Turn = 'idle' | 'thinking' | 'talking'

// voices that work on ElevenLabs' free plan. '' means the default set on the server.
const VOICES = [
  { id: '', name: 'Sarah', note: 'soft, warm' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', note: 'gentle, British' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', note: 'bright, playful' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', note: 'upbeat' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', note: 'clear, British' },
]

// remembers the voice choice in this browser. storage can be unavailable, so it's best-effort.
function savedVoice(): { voiceId: string; softness: number } {
  try {
    const saved = JSON.parse(window.localStorage.getItem('diksha-voice') ?? 'null')
    if (typeof saved?.voiceId === 'string' && typeof saved?.softness === 'number') return saved
  } catch {}
  return { voiceId: '', softness: 0.6 }
}

const GREETING: Message = { role: 'assistant', content: "Hi Akash. I'm D.I.K.S.H.A. How can I help you today?" }

// while she talks, the mic hears her too. this tells her own words apart from Akash's.
function isEcho(heard: string, reply: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? []
  const said = new Set(words(reply))
  const picked = words(heard)
  if (!picked.length) return true
  return picked.filter((word) => said.has(word)).length / picked.length >= 0.7
}

const pill = (active: boolean) =>
  ({
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #444',
    background: active ? '#fff' : 'rgba(20, 20, 20, 0.7)',
    color: active ? '#000' : '#ccc',
    fontSize: 13,
    cursor: 'pointer',
  }) as const

const panel = {
  marginTop: 8,
  width: 300,
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: 12,
  borderRadius: 12,
  border: '1px solid #444',
  background: 'rgba(20, 20, 20, 0.95)',
  color: '#ddd',
  fontSize: 13,
  textAlign: 'left',
} as const

const STATUS: Record<PresenceState, string> = {
  idle: '',
  listening: 'Listening',
  thinking: 'Thinking',
  talking: 'Speaking',
}

const EMOTION: Record<string, string> = {
  happy: 'Happy',
  neutral: 'Neutral',
  sad: 'Sad',
  angry: 'Angry',
  surprised: 'Surprised',
  fearful: 'Fearful',
  disgusted: 'Disgusted',
  contempt: 'Contempt',
}

export default function Assistant() {
  const [turn, setTurn] = useState<Turn>('idle')
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [voiceOn, setVoiceOn] = useState(false)
  const [listening, setListening] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [memories, setMemories] = useState<Memory[]>([])
  const [openPanel, setOpenPanel] = useState<'memory' | 'voice' | null>(null)
  const [voice, setVoice] = useState({ voiceId: '', softness: 0.6 })
  const [emotion, setEmotion] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<MediaStream | null>(null)

  // the speech callbacks fire outside React's render cycle, so they read these refs
  const messagesRef = useRef<Message[]>([GREETING])
  const voiceOnRef = useRef(false)
  const busyRef = useRef(false)
  const recognizerRef = useRef<Recognizer | null>(null)
  const speakerRef = useRef<Speaker | null>(null)
  const speaking = useRef(false)
  const streamDone = useRef(true)
  const emotionRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null) // cancels the reply she's streaming
  const replyRef = useRef('') // what she's saying now, to spot her own voice in the mic
  const spokeAt = useRef(0) // when she last stopped speaking
  const queuedRef = useRef('') // something Akash said before her interrupted turn had wound down

  // keep the newest message in view
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  useEffect(() => {
    window.speechSynthesis?.getVoices() // voices load lazily, so ask early
    void syncMemories('GET')
    chooseVoice(savedVoice())
    const speaker = createSpeaker({
      onStart: () => setTurn('talking'),
      onIdle: () => {
        speaking.current = false
        spokeAt.current = Date.now()
        finishTurnRef.current()
      },
    })
    speakerRef.current = speaker
    return () => {
      voiceOnRef.current = false
      recognizerRef.current?.abort()
      speaker.stop()
      cameraRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Periodically detect emotion from the camera when it's on
  useEffect(() => {
    let active = true
    const loop = async () => {
      if (!active) return
      if (cameraOn && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const detected = await detectUserEmotion(videoRef.current)
          if (detected && active) {
            emotionRef.current = detected
            setEmotion(detected)
          }
        } catch (err) {
          console.warn('Emotion detection failed:', err)
        }
      }
      if (active) setTimeout(loop, 4000)
    }
    if (cameraOn) loop()
    return () => { active = false }
  }, [cameraOn])

  function updateMessages(next: Message[]) {
    messagesRef.current = next
    setMessages(next)
  }

  // barge-in: Akash talked over her, so she goes quiet and drops the rest of her reply
  function interrupt() {
    abortRef.current?.abort()
    speakerRef.current?.stop()
    speaking.current = false
  }

  // a turn is over once the reply has fully arrived and she has finished saying it
  function finishTurn() {
    if (!streamDone.current || speaking.current) return
    busyRef.current = false
    setTurn('idle')
    const queued = queuedRef.current
    if (queued) {
      queuedRef.current = ''
      void ask(queued, true)
    } else if (voiceOnRef.current) listen()
  }
  // the speaker is created once, so it calls the latest finishTurn through this ref
  const finishTurnRef = useRef(finishTurn)
  useEffect(() => {
    finishTurnRef.current = finishTurn
  })

  function say(text: string) {
    speaking.current = true
    speakerRef.current?.enqueue(text)
    listen() // keep the mic open while she talks, so Akash can cut in
  }

  function listen() {
    // she listens while idle and while speaking, but not while she's still thinking
    if (!voiceOnRef.current || recognizerRef.current) return
    if (busyRef.current && !speaking.current) return
    const recognizer = createRecognizer()
    if (!recognizer) return

    recognizer.lang = 'en-IN'
    recognizer.interimResults = true
    recognizer.continuous = false

    let heard = ''
    recognizer.onresult = (e) => {
      let final = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }
      // her own voice coming back through the speakers, during or just after she speaks
      const nearHerVoice = speaking.current || Date.now() - spokeAt.current < 1500
      if (nearHerVoice && isEcho(final + interim, replyRef.current)) return
      if (speaking.current) {
        // one half-heard word is too easy to get wrong, so wait for more before cutting in
        if (!final && interim.trim().split(/\s+/).length < 2) return
        interrupt()
      }
      heard += final
      setInput(heard + interim) // show the words as they're recognised
    }
    recognizer.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      const blocked = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      setError(blocked ? 'Microphone access is blocked. Allow it in the browser and try again.' : `Voice input failed (${e.error}).`)
      stopVoice()
    }
    recognizer.onend = () => {
      recognizerRef.current = null
      setListening(false)
      const text = heard.trim()
      if (text && busyRef.current) queuedRef.current = text // her interrupted turn is still winding down
      else if (text) void ask(text, true)
      else if (voiceOnRef.current) setTimeout(listen, 250) // silence, so keep waiting
    }

    recognizerRef.current = recognizer
    try {
      recognizer.start()
      setListening(true)
    } catch {
      recognizerRef.current = null
    }
  }

  function startVoice() {
    if (!createRecognizer() || !window.speechSynthesis) {
      setError('Voice needs Chrome or Edge.')
      return
    }
    setError('')
    unlockAudio() // browsers only allow sound after a click, and this is that click
    voiceOnRef.current = true
    setVoiceOn(true)
    listen()
  }

  function stopVoice() {
    voiceOnRef.current = false
    setVoiceOn(false)
    recognizerRef.current?.abort()
    speakerRef.current?.stop()
  }

  function chooseVoice(next: { voiceId: string; softness: number }) {
    setVoice(next)
    setVoiceOptions(next)
    try {
      window.localStorage.setItem('diksha-voice', JSON.stringify(next))
    } catch {}
  }

  // lets Akash hear the current voice settings without starting a conversation
  function testVoice() {
    if (busyRef.current || speaking.current) return
    unlockAudio()
    say('Hi Akash. This is how I sound now. Tell me if you want me softer.')
  }

  // one helper for all three memory calls; each answers with the up-to-date list
  async function syncMemories(method: 'GET' | 'POST' | 'DELETE', options: { id?: string; body?: object } = {}) {
    try {
      const url = options.id ? `/api/memory?id=${encodeURIComponent(options.id)}` : '/api/memory'
      const res = await fetch(url, {
        method,
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      })
      if (res.ok) setMemories((await res.json()).memories)
    } catch {
      // memory is a bonus. if it fails, the conversation carries on.
    }
  }

  function forgetEverything() {
    if (window.confirm('Erase everything D.I.K.S.H.A remembers about you?')) void syncMemories('DELETE')
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      })
      cameraRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
      setError('')
      // Load emotion models once and detect from the camera feed
      await loadEmotionModels()
    } catch {
      setError('Camera access is blocked. Allow it in the browser and try again.')
    }
  }

  function stopCamera() {
    cameraRef.current?.getTracks().forEach((track) => track.stop())
    cameraRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    // with the camera off she can't see his face, so an old reading mustn't linger
    emotionRef.current = null
    setEmotion(null)
  }

  // one small JPEG of what the camera sees right now, as base64, or null if it's off
  function captureFrame(): string | null {
    const video = videoRef.current
    if (!cameraRef.current || !video || !video.videoWidth) return null
    const width = 512
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * width)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null
  }

  async function ask(text: string, speak: boolean) {
    if (busyRef.current) return
    busyRef.current = true
    streamDone.current = false
    const controller = new AbortController()
    abortRef.current = controller
    replyRef.current = ''

    const history: Message[] = [...messagesRef.current, { role: 'user', content: text }]
    updateMessages(history)
    setInput('')
    setError('')
    setTurn('thinking')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, image: captureFrame(), emotion: emotionRef.current }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error((await res.text()) || 'Request failed.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''
      let unspoken = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done || controller.signal.aborted) break
        const chunk = decoder.decode(value, { stream: true })
        reply += chunk
        replyRef.current = reply
        updateMessages([...history, { role: 'assistant', content: reply }])

        if (speak && voiceOnRef.current) {
          // speak each sentence as soon as it's complete instead of waiting for the full reply
          unspoken += chunk
          const [sentences, rest] = takeSentences(unspoken)
          unspoken = rest
          sentences.forEach(say)
        } else {
          setTurn('talking')
        }
      }
      if (controller.signal.aborted) return
      if (speak && voiceOnRef.current && unspoken.trim()) say(unspoken.trim())

      // in the background, let her keep anything worth remembering from this exchange
      if (reply) void syncMemories('POST', { body: { user: text, assistant: reply } })
    } catch (err) {
      // an interrupted reply isn't an error
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      streamDone.current = true
      finishTurn()
    }
  }

  function send(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busyRef.current) return
    recognizerRef.current?.abort()
    void ask(text, voiceOnRef.current)
  }

  const busy = turn !== 'idle'
  const presence: PresenceState = turn === 'idle' && listening ? 'listening' : turn
  const energy = () => speakerRef.current?.energy() ?? null
  const togglePanel = (name: 'memory' | 'voice') => setOpenPanel(openPanel === name ? null : name)

  return (
    <div style={{ position: 'relative', height: '100%', background: '#07080c', color: '#fff', overflow: 'hidden' }}>
      {/* her presence fills the upper part of the screen */}
      <div style={{ position: 'absolute', inset: '0 0 28% 0' }}>
        <ThreeDPresence state={presence} energy={energy} />
      </div>

      <div
        style={{
          position: 'absolute',
          top: '62%',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ letterSpacing: '0.45em', fontSize: 14, color: '#c9cdd6' }}>D.I.K.S.H.A</div>
        <div style={{ marginTop: 6, height: 18, fontSize: 12, letterSpacing: '0.2em', color: '#7d8494' }} aria-live="polite">
          {STATUS[presence].toUpperCase()}
        </div>
        {emotion && <div style={{ marginTop: 4, fontSize: 11, color: '#a3be8c' }}>Emotion: {EMOTION[emotion] || emotion}</div>}
      </div>

      {/* settings: what she remembers, and how she sounds */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1, textAlign: 'right' }}>
        <button type="button" onClick={() => togglePanel('memory')} aria-expanded={openPanel === 'memory'} style={pill(openPanel === 'memory')}>
          Memory ({memories.length})
        </button>
        <button
          type="button"
          onClick={() => togglePanel('voice')}
          aria-expanded={openPanel === 'voice'}
          style={{ ...pill(openPanel === 'voice'), marginLeft: 6 }}
        >
          Voice
        </button>

        {openPanel === 'voice' && (
          <div style={panel}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {VOICES.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => chooseVoice({ ...voice, voiceId: v.id })}
                  aria-pressed={voice.voiceId === v.id}
                  style={{ ...pill(voice.voiceId === v.id), textAlign: 'left', borderRadius: 8 }}
                >
                  {v.name} · {v.note}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              Softness
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(voice.softness * 100)}
                onChange={(e) => chooseVoice({ ...voice, softness: Number(e.target.value) / 100 })}
                style={{ display: 'block', width: '100%', marginTop: 6 }}
              />
            </label>
            <button type="button" onClick={testVoice} style={pill(false)}>
              Hear her
            </button>
          </div>
        )}

        {openPanel === 'memory' && (
          <div style={panel}>
            {memories.length === 0 && <div style={{ color: '#888' }}>She doesn&apos;t remember anything yet.</div>}
            {memories.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{m.text}</span>
                <button
                  type="button"
                  onClick={() => void syncMemories('DELETE', { id: m.id })}
                  aria-label={`Forget: ${m.text}`}
                  style={{ ...pill(false), padding: '2px 8px' }}
                >
                  Forget
                </button>
              </div>
            ))}
            {memories.length > 0 && (
              <button type="button" onClick={forgetEverything} style={{ ...pill(false), color: '#ff8a8a' }}>
                Forget everything
              </button>
            )}
          </div>
        )}
      </div>

      {/* what she sees. always mounted so the stream has somewhere to go, hidden when off. */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: cameraOn ? 'block' : 'none',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #444',
        }}
      >
        <video ref={videoRef} muted playsInline style={{ display: 'block', width: 180, transform: 'scaleX(-1)' }} />
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            textShadow: '0 1px 2px #000',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5484d' }} />
          She can see this
        </div>
      </div>

      {/* conversation and controls */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          width: 'min(680px, calc(100% - 32px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div ref={logRef} style={{ maxHeight: '22vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.slice(-6).map((m, i) => (
            <div
              // keyed by position in the whole conversation, so each message keeps its words on screen
              key={Math.max(0, messages.length - 6) + i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.role === 'user' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: m.role === 'user' ? '#aeb4c2' : '#e8eaf0',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
              }}
            >
              {m.role === 'assistant' ? <Caption text={m.content} /> : m.content}
            </div>
          ))}
          {error && <div style={{ color: '#ff8a8a', paddingLeft: 4 }}>{error}</div>}
        </div>

        <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={voiceOn ? stopVoice : startVoice}
            aria-pressed={voiceOn}
            style={{ ...pill(false), padding: '10px 16px', background: voiceOn ? '#e5484d' : 'rgba(20, 20, 20, 0.9)', color: '#fff', whiteSpace: 'nowrap' }}
          >
            {voiceOn ? 'End talk' : 'Talk to me'}
          </button>
          <button
            type="button"
            onClick={cameraOn ? stopCamera : startCamera}
            aria-pressed={cameraOn}
            style={{ ...pill(false), padding: '10px 16px', background: cameraOn ? '#e5484d' : 'rgba(20, 20, 20, 0.9)', color: '#fff', whiteSpace: 'nowrap' }}
          >
            {cameraOn ? 'Camera off' : 'Camera on'}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voiceOn ? 'Speak, or type here' : 'Say something to D.I.K.S.H.A'}
            aria-label="Message"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid #444',
              background: 'rgba(20, 20, 20, 0.9)',
              color: '#fff',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{ ...pill(true), padding: '10px 18px', opacity: busy || !input.trim() ? 0.5 : 1 }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
