'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { AvatarState, GestureCue } from './Avatar'
import { EMOTIONS, GESTURES, findCues, isEmotion, isGesture, stripCues, type Emotion } from '@/lib/cues'
import { createRecognizer, takeSentences, type Recognizer } from '@/lib/speech'
import { createSpeaker, setVoiceOptions, unlockAudio, type Speaker } from '@/lib/voice'

// three.js needs the browser, so never render the avatar on the server
const Avatar = dynamic(() => import('./Avatar'), { ssr: false })

// content keeps her body-language tags so she stays consistent across turns;
// they're stripped when a message is shown or spoken
type Message = { role: 'user' | 'assistant'; content: string }
type Memory = { id: string; text: string }

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

const chip = (active: boolean) =>
  ({
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid #555',
    background: active ? '#fff' : 'rgba(20, 20, 20, 0.7)',
    color: active ? '#000' : '#ccc',
    fontSize: 12,
    cursor: 'pointer',
  }) as const

export default function AvatarStage() {
  const [state, setState] = useState<AvatarState>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [voiceOn, setVoiceOn] = useState(false)
  const [listening, setListening] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [emotion, setEmotion] = useState<Emotion>('neutral')
  const [memories, setMemories] = useState<Memory[]>([])
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voice, setVoice] = useState({ voiceId: '', softness: 0.6 })
  const [gesture, setGesture] = useState<GestureCue | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<MediaStream | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // the speech callbacks fire outside React's render cycle, so they read these refs
  const messagesRef = useRef<Message[]>([])
  const voiceOnRef = useRef(false)
  const busyRef = useRef(false)
  const recognizerRef = useRef<Recognizer | null>(null)
  const speakerRef = useRef<Speaker | null>(null)
  const speaking = useRef(false)
  const streamDone = useRef(true)

  // keep the newest message in view
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  useEffect(() => {
    window.speechSynthesis?.getVoices() // voices load lazily, so ask early
    void syncMemories('GET')
    chooseVoice(savedVoice())
    const speaker = createSpeaker({
      onStart: () => setState('talking'),
      onIdle: () => {
        speaking.current = false
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

  function updateMessages(next: Message[]) {
    messagesRef.current = next
    setMessages(next)
  }

  // a turn is over once the reply has fully arrived and she has finished saying it
  function finishTurn() {
    if (!streamDone.current || speaking.current) return
    busyRef.current = false
    setState('idle')
    // let the feeling linger a moment, then relax her face
    window.setTimeout(() => {
      if (!busyRef.current) setEmotion('neutral')
    }, 5000)
    if (voiceOnRef.current) listen()
  }
  // the speaker is created once, so it calls the latest finishTurn through this ref
  const finishTurnRef = useRef(finishTurn)
  useEffect(() => {
    finishTurnRef.current = finishTurn
  })

  function say(text: string) {
    speaking.current = true
    speakerRef.current?.enqueue(text)
  }

  function listen() {
    if (!voiceOnRef.current || busyRef.current || recognizerRef.current) return
    const recognizer = createRecognizer()
    if (!recognizer) return

    recognizer.lang = 'en-IN'
    recognizer.interimResults = true
    recognizer.continuous = false

    let heard = ''
    recognizer.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) heard += result[0].transcript
        else interim += result[0].transcript
      }
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
      if (text) ask(text, true)
      else if (voiceOnRef.current && !busyRef.current) setTimeout(listen, 250) // silence, so keep waiting
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
    } catch {
      setError('Camera access is blocked. Allow it in the browser and try again.')
    }
  }

  function stopCamera() {
    cameraRef.current?.getTracks().forEach((track) => track.stop())
    cameraRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
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

    const history: Message[] = [...messagesRef.current, { role: 'user', content: text }]
    updateMessages(history)
    setInput('')
    setError('')
    setState('thinking')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, image: captureFrame() }),
      })
      if (!res.ok || !res.body) throw new Error((await res.text()) || 'Request failed.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''
      let cuesDone = 0 // how many body-language tags we've already acted out
      let spoken = 0 // how much of the visible text has been handed to her voice
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
        updateMessages([...history, { role: 'assistant', content: reply }])

        // act out any new mood or gesture tags as they arrive
        const cues = findCues(reply)
        for (const cue of cues.slice(cuesDone)) {
          if (isEmotion(cue)) setEmotion(cue)
          else if (isGesture(cue)) setGesture({ name: cue })
        }
        cuesDone = cues.length

        if (speak && voiceOnRef.current) {
          // speak each sentence as soon as it's complete instead of waiting for the full reply
          const visible = stripCues(reply)
          const [sentences, rest] = takeSentences(visible.slice(spoken))
          spoken = visible.length - rest.length
          sentences.forEach(say)
        } else {
          setState('talking')
        }
      }
      const leftover = stripCues(reply).slice(spoken).trim()
      if (speak && voiceOnRef.current && leftover) say(leftover)

      // in the background, let her keep anything worth remembering from this exchange
      if (reply) void syncMemories('POST', { body: { user: text, assistant: stripCues(reply) } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      streamDone.current = true
      finishTurn()
    }
  }

  function send(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busyRef.current) return
    recognizerRef.current?.abort()
    ask(text, voiceOnRef.current)
  }

  const mouthLevel = () => speakerRef.current?.lips() ?? null
  const busy = state !== 'idle'
  const status = state === 'thinking' ? 'D.I.K.S.H.A is thinking…' : listening ? 'Listening…' : ''

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Avatar
        state={state === 'idle' && listening ? 'listening' : state}
        emotion={emotion}
        gesture={gesture}
        mouthLevel={mouthLevel}
      />

      {/* try her moves by hand. handy while tuning the animation; remove when you're done. */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 320 }}>
        {GESTURES.map((name) => (
          <button key={name} type="button" onClick={() => setGesture({ name })} style={chip(false)}>
            {name}
          </button>
        ))}
        {EMOTIONS.map((name) => (
          <button key={name} type="button" onClick={() => setEmotion(name)} style={chip(emotion === name)}>
            {name}
          </button>
        ))}
      </div>

      {/* what she remembers, with the power to make her forget */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1, textAlign: 'right' }}>
        <button
          type="button"
          onClick={() => setMemoryOpen(!memoryOpen)}
          aria-expanded={memoryOpen}
          style={chip(memoryOpen)}
        >
          Memory ({memories.length})
        </button>
        <button
          type="button"
          onClick={() => setVoiceOpen(!voiceOpen)}
          aria-expanded={voiceOpen}
          style={{ ...chip(voiceOpen), marginLeft: 6 }}
        >
          Voice
        </button>
        {voiceOpen && (
          <div
            style={{
              marginTop: 8,
              width: 300,
              padding: 12,
              borderRadius: 12,
              border: '1px solid #444',
              background: 'rgba(20, 20, 20, 0.95)',
              color: '#ddd',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {VOICES.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => chooseVoice({ ...voice, voiceId: v.id })}
                  aria-pressed={voice.voiceId === v.id}
                  style={{ ...chip(voice.voiceId === v.id), textAlign: 'left', borderRadius: 8, padding: '6px 10px' }}
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
            <button type="button" onClick={testVoice} style={chip(false)}>
              Hear her
            </button>
          </div>
        )}
        {memoryOpen && (
          <div
            style={{
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
            }}
          >
            {memories.length === 0 && <div style={{ color: '#888' }}>She doesn&apos;t remember anything yet.</div>}
            {memories.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{m.text}</span>
                <button
                  type="button"
                  onClick={() => void syncMemories('DELETE', { id: m.id })}
                  aria-label={`Forget: ${m.text}`}
                  style={{ ...chip(false), padding: '2px 8px' }}
                >
                  Forget
                </button>
              </div>
            ))}
            {memories.length > 0 && (
              <button type="button" onClick={forgetEverything} style={{ ...chip(false), color: '#ff8a8a' }}>
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
          top: 60,
          right: 16,
          display: cameraOn ? 'block' : 'none',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #555',
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ display: 'block', width: 180, transform: 'scaleX(-1)' }}
        />
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#fff',
            textShadow: '0 1px 2px #000',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5484d' }} />
          She can see this
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          width: 'min(640px, calc(100% - 32px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          ref={logRef}
          style={{ maxHeight: '32vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.role === 'user' ? '#fff' : 'rgba(30, 30, 30, 0.85)',
                color: m.role === 'user' ? '#000' : '#fff',
                border: '1px solid #444',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
              }}
            >
              {m.role === 'assistant' ? stripCues(m.content) : m.content}
            </div>
          ))}
          {status && <div style={{ color: '#aaa', paddingLeft: 4 }}>{status}</div>}
          {error && <div style={{ color: '#ff8a8a', paddingLeft: 4 }}>{error}</div>}
        </div>

        <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={voiceOn ? stopVoice : startVoice}
            aria-pressed={voiceOn}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #555',
              background: voiceOn ? '#e5484d' : 'rgba(20, 20, 20, 0.9)',
              color: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {voiceOn ? 'End talk' : 'Talk to me'}
          </button>
          <button
            type="button"
            onClick={cameraOn ? stopCamera : startCamera}
            aria-pressed={cameraOn}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #555',
              background: cameraOn ? '#e5484d' : 'rgba(20, 20, 20, 0.9)',
              color: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {cameraOn ? 'Close eyes' : 'Open eyes'}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voiceOn ? 'Speak, or type here' : 'Say something to D.I.K.S.H.A'}
            aria-label="Message"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #555',
              background: 'rgba(20, 20, 20, 0.9)',
              color: '#fff',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid #555',
              background: '#fff',
              color: '#000',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy || !input.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
