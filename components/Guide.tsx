'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import ThreeDPresence, { type PresenceState } from './ThreeDPresence'
import { HUES } from '@/lib/presence'
import Caption from './Caption'
import Backdrop, { HudRing } from './Backdrop'
import Boot, { type EntryMode } from './Boot'
import { intro, publishedProjects, suggestions } from '@/content/portfolio'
import { createRecognizer, takeSentences, type Recognizer } from '@/lib/speech'
import { playWakeSound } from '@/lib/sounds'
import { audioContext, createSpeaker, unlockAudio, type Speaker } from '@/lib/voice'

type Message = { role: 'user' | 'assistant'; content: string }
type Phase = 'greeting' | 'intro' | 'chat'

// she writes [[show:project-id]] to put a project on screen. the tag is acted on, then hidden.
const SHOW = /\[\[show:([a-z0-9-]+)\]\]\s*/gi
const shownIn = (text: string) => [...text.matchAll(SHOW)].map((match) => match[1].toLowerCase())
// also hides a half-arrived tag at the very end, so it never flashes while the reply streams
const visible = (text: string) => text.replace(SHOW, '').replace(/\[\[?[a-z0-9:-]*$/i, '')

const button = (primary: boolean) =>
  ({
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(255, 255, 255, 0.12)',
    background: primary ? '#fff' : 'rgba(255, 255, 255, 0.04)',
    color: primary ? '#000' : '#d5d9e2',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }) as const

// how long a line stays on screen while she can't be heard yet: about as long as saying it
const readingTime = (text: string) => 800 + text.split(/\s+/).length * 380
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
// sound plays only once the browser lets the page's audio run
const audible = () => audioContext()?.state === 'running'

const STATUS: Record<PresenceState, string> = { idle: '', listening: 'Listening', thinking: 'Thinking', talking: 'Speaking' }

export default function Guide() {
  const [phase, setPhase] = useState<Phase>('greeting')
  const [turn, setTurn] = useState<PresenceState>('idle')
  const [question, setQuestion] = useState('')
  const [caption, setCaption] = useState('')
  const [line, setLine] = useState({ id: 0, pace: 0 }) // which caption line this is, and how fast its words appear
  const [shown, setShown] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [awake, setAwake] = useState(false) // she's dim until her introduction starts
  const [muted, setMuted] = useState(true) // the browser hasn't let her speak yet
  const [entry, setEntry] = useState<EntryMode | null>(null) // how the visitor came in past the boot screen
  const [pulse, setPulse] = useState(0)
  const [voiceOn, setVoiceOn] = useState(false)
  const [listening, setListening] = useState(false)

  // the speech callbacks fire outside React's render cycle, so they read these refs
  const messagesRef = useRef<Message[]>([])
  const phaseRef = useRef<Phase>('greeting')
  const busyRef = useRef(false)
  const speakerRef = useRef<Speaker | null>(null)
  const voiceOnRef = useRef(false)
  const recognizerRef = useRef<Recognizer | null>(null)
  const speaking = useRef(false)
  const streamDone = useRef(true)
  const skipped = useRef(false) // the visitor pressed Skip intro
  const awakeRef = useRef(false) // read by the voice callbacks, which can't see fresh state
  const soundOn = useRef(false) // browsers only allow sound after the visitor clicks something
  const introRunning = useRef(false)
  const unmuteRef = useRef<(() => void) | null>(null) // ends a silent caption early once sound is allowed
  const entryRef = useRef<EntryMode | null>(null)
  // the speaker is created once, so it reaches the latest finishTurn through this ref
  const finishTurnRef = useRef<() => void>(() => {})

  // the page stays put behind the boot screen
  useEffect(() => {
    document.documentElement.style.overflow = entry ? '' : 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [entry])

  // after an automatic entry nobody has clicked yet, so the browser keeps her silent. the first
  // tap or key press brings her voice in, and if she was mid-line she says that line out loud.
  useEffect(() => {
    if (entry !== 'auto') return
    const events = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const
    const unlock = () => {
      unlockAudio()
      void audioContext()
        ?.resume()
        .then(() => {
          if (soundOn.current) return
          soundOn.current = true
          setMuted(false)
          events.forEach((name) => window.removeEventListener(name, unlock))
          unmuteRef.current?.()
        })
    }
    events.forEach((name) => window.addEventListener(name, unlock))
    return () => events.forEach((name) => window.removeEventListener(name, unlock))
  }, [entry])

  useEffect(() => {
    const speaker = createSpeaker({
      onStart: () => setTurn('talking'),
      onIdle: () => {
        speaking.current = false
        finishTurnRef.current()
      },
    })
    speakerRef.current = speaker
    return () => speaker.stop()
  }, [])

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
      setInput(heard + interim)
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
      if (text) void ask(text)
      else if (voiceOnRef.current && !busyRef.current) setTimeout(listen, 250)
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
    enableSound()
    wake()
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

  // a turn is over once the reply has fully arrived and she has finished saying it
  function finishTurn() {
    // between intro lines the speaker goes idle for a moment, which isn't the end of anything
    if (introRunning.current || !streamDone.current || speaking.current) return
    busyRef.current = false
    setTurn('idle')
    if (phaseRef.current !== 'chat') {
      phaseRef.current = 'chat'
      setPhase('chat')
    }
    if (voiceOnRef.current) listen()
  }

  function enableSound() {
    unlockAudio()
    soundOn.current = true
    entryRef.current = 'sound'
    setMuted(false)
  }

  // the visitor came in through the boot screen. 'sound' came from a click, so audio may start.
  function enter(mode: EntryMode) {
    entryRef.current = mode
    setEntry(mode)
    if (mode === 'sound') enableSound()
    // let the boot screen fold away into her before she wakes
    window.setTimeout(() => void runIntro(), 750)
  }

  // the Turn on sound button: she picks up from the current line, out loud
  function turnSoundOn() {
    enableSound()
    void audioContext()
      ?.resume()
      .then(() => unmuteRef.current?.())
  }

  // puts a project card on screen. at most three at once, newest last.
  function reveal(id: string) {
    if (!publishedProjects.some((project) => project.id === id)) return
    setShown((current) => (current.includes(id) ? current : [...current, id].slice(-3)))
  }

  // starts a new caption line. with `seconds`, its words appear spread over that long.
  function newCaption(text: string, seconds = 0) {
    const words = text.split(/\s+/).filter(Boolean).length
    setLine((current) => ({ id: current.id + 1, pace: seconds && words > 1 ? (seconds * 0.85) / words : 0 }))
    setCaption(text)
  }

  // shows a line with no sound. resolves true if the visitor turned sound on meanwhile.
  function showSilently(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        unmuteRef.current = null
        resolve(false)
      }, readingTime(text))
      unmuteRef.current = () => {
        window.clearTimeout(timer)
        unmuteRef.current = null
        resolve(true)
      }
    })
  }

  // her wake-up moment: the ring brightens and sends out a burst of light, with a sound if allowed
  function wake() {
    if (awakeRef.current) return
    awakeRef.current = true
    setAwake(true)
    setPulse((count) => count + 1)
    if (soundOn.current && audible()) playWakeSound()
  }

  // her introduction, line by line, starting as the visitor enters. without sound, the
  // captions and project cards carry on in silence until sound is turned on.
  async function runIntro() {
    if (phaseRef.current !== 'greeting' || skipped.current) return
    phaseRef.current = 'intro'
    setPhase('intro')
    busyRef.current = true
    introRunning.current = true

    // some browsers allow sound straight away (for example on a site visited often), but a
    // visitor who chose to come in without sound stays without it
    if (entryRef.current !== 'silent') {
      unlockAudio()
      await wait(50)
      if (audible()) {
        soundOn.current = true
        setMuted(false)
      }
    }
    wake()
    await wait(soundOn.current ? 1100 : 400) // let the wake-up sound ring out first

    for (let index = 0; index < intro.length; index++) {
      if (skipped.current) break
      const line = intro[index]
      const show = (seconds: number | null) => {
        newCaption(line.text, seconds ?? readingTime(line.text) / 1000)
        if (line.show) reveal(line.show)
      }
      if (soundOn.current && audible()) {
        speaking.current = true
        await speakerRef.current?.enqueue(line.text, { url: `/api/intro/${index}`, onStart: show })
      } else {
        show(null)
        setTurn('talking')
        // the visitor tapped partway through: say this line again, out loud this time
        if (await showSilently(line.text)) index--
      }
    }

    introRunning.current = false
    speaking.current = false
    finishTurn()
  }

  // stops her mid-introduction and goes straight to questions
  function skipIntro() {
    skipped.current = true
    speakerRef.current?.stop()
    unmuteRef.current?.() // ends a silent line early, and the intro loop sees it was skipped
    newCaption('What would you like to know about him?', 1)
    // before the intro has begun there's no loop to wind it down, so end it here
    if (!introRunning.current) finishTurn()
  }

  // the speaker and the start-up timer were set up once, so they reach the latest versions through refs
  useEffect(() => {
    finishTurnRef.current = finishTurn
  })

  async function ask(text: string) {
    if (busyRef.current) return
    if (entryRef.current !== 'silent') enableSound()
    busyRef.current = true
    streamDone.current = false
    if (phaseRef.current !== 'chat') {
      phaseRef.current = 'chat'
      setPhase('chat')
    }

    const history: Message[] = [...messagesRef.current, { role: 'user', content: text }]
    messagesRef.current = history
    setQuestion(text)
    newCaption('')
    setInput('')
    setError('')
    setTurn('thinking')

    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      if (!res.ok || !res.body) throw new Error((await res.text()) || 'Request failed.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''
      let revealed = 0 // how many show-tags we've already acted on
      let spoken = 0 // how much of the visible text has been handed to her voice
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })

        const ids = shownIn(reply)
        ids.slice(revealed).forEach(reveal)
        revealed = ids.length

        const text = visible(reply)
        setCaption(text)
        if (soundOn.current) {
          // speak each sentence as soon as it's complete instead of waiting for the full reply
          const [sentences, rest] = takeSentences(text.slice(spoken))
          spoken = text.length - rest.length
          for (const sentence of sentences) {
            speaking.current = true
            speakerRef.current?.enqueue(sentence)
          }
        } else {
          setTurn('talking')
        }
      }
      const leftover = visible(reply).slice(spoken).trim()
      if (soundOn.current && leftover) {
        speaking.current = true
        speakerRef.current?.enqueue(leftover)
      }
      messagesRef.current = [...history, { role: 'assistant', content: visible(reply) }]
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
    if (text) void ask(text)
  }

  const busy = turn !== 'idle'
  const presence: PresenceState = turn === 'idle' && listening ? 'listening' : turn
  const energy = () => speakerRef.current?.energy() ?? null
  const cards = publishedProjects.filter((project) => shown.includes(project.id))

  return (
    <section
      aria-label="D.I.K.S.H.A, Akash's AI guide"
      className={`guide${entry ? ' is-live' : ''}`}
      // the page's accent colour follows hers: blue idle, teal listening, violet thinking, rose speaking
      style={{
        ['--accent-h' as string]: HUES[presence],
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 16px 28px',
        background: '#07080c',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      <Boot onEnter={enter} />
      <Backdrop state={presence} energy={energy} />

      <div className="presence-stage" style={{ position: 'relative', width: '100%', height: '46vh', minHeight: 280 }}>
        <HudRing />
        <ThreeDPresence state={presence} energy={energy} dormant={!awake} pulse={pulse} />
      </div>

      {/* her name arrives one letter at a time, once the visitor has entered */}
      <div className="guide-name" aria-label="D.I.K.S.H.A">
        {'D.I.K.S.H.A'.split('').map((letter, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="hold-until-live"
            style={{ display: 'inline-block', animation: 'rise-in 0.5s ease both', animationDelay: `${0.5 + index * 0.07}s` }}
          >
            {letter}
          </span>
        ))}
      </div>
      <div className="guide-status">
        {STATUS[presence].toUpperCase()}
      </div>

      {/* what she's saying, as text. this is also how the page works with the sound off. */}
      <div style={{ position: 'relative', width: 'min(760px, 100%)', marginTop: 22, textAlign: 'center', minHeight: 96 }} aria-live="polite">
        {phase === 'chat' && question && <p style={{ margin: '0 0 8px', fontSize: 14, color: '#7d8494' }}>{question}</p>}
        <p className="guide-caption">
          <Caption key={line.id} text={caption} pace={line.pace} />
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#ff8a8a', fontSize: 14 }}>{error}</p>}
      </div>

      {/* projects appear here as she mentions them */}
      {cards.length > 0 && (
        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 20, width: 'min(960px, 100%)' }}>
          {cards.map((project) => (
            <a
              key={project.id}
              href={`#project-${project.id}`}
              className="glass-card"
              style={{
                flex: '1 1 240px',
                maxWidth: 300,
                padding: 16,
                borderRadius: 14,
                color: 'inherit',
                textDecoration: 'none',
                animation: 'rise-in 0.5s ease both',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600 }}>{project.name}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#9aa1b0', lineHeight: 1.4 }}>{project.tagline}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#6f7686' }}>{project.stack.slice(0, 4).join(' · ')}</div>
            </a>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative', width: 'min(720px, 100%)', marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {phase !== 'chat' && (
          <div className="hold-until-live" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, animation: 'rise-in 0.6s ease both', animationDelay: '1.4s' }}>
            {muted && (
              <button type="button" onClick={turnSoundOn} className="glass-btn" style={{ ...button(false), borderStyle: 'dashed', color: '#c9cfdc' }}>
                Turn on sound
              </button>
            )}
            <button
              type="button"
              onClick={voiceOn ? stopVoice : startVoice}
              aria-pressed={voiceOn}
              className="glass-btn" style={{ ...button(voiceOn), background: voiceOn ? '#e5484d' : '#fff', color: voiceOn ? '#fff' : '#000' }}
            >
              {voiceOn ? 'End talk' : 'Talk to me'}
            </button>
            <button type="button" onClick={skipIntro} className="glass-btn" style={button(false)}>
              Skip intro
            </button>
            <a href="#projects" className="glass-btn" style={{ ...button(false), textDecoration: 'none' }}>
              Skip to projects
            </a>
          </div>
        )}

        {phase === 'chat' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(suggestion)}
                  className="glass-btn"
                  style={{ ...button(false), padding: '8px 14px', fontSize: 13, opacity: busy ? 0.5 : 1 }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form onSubmit={send} style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button
                type="button"
                onClick={voiceOn ? stopVoice : startVoice}
                aria-pressed={voiceOn}
                className="glass-btn" style={{ ...button(false), padding: '10px 16px', background: voiceOn ? '#e5484d' : 'rgba(255, 255, 255, 0.04)', color: '#fff', whiteSpace: 'nowrap' }}
              >
                {voiceOn ? 'End talk' : 'Talk to me'}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder={voiceOn ? 'Listening... Speak now' : 'Ask her anything about Akash'}
                aria-label="Your question"
                className="glass-input"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <button type="submit" disabled={busy || !input.trim()} className="glass-btn" style={{ ...button(true), opacity: busy || !input.trim() ? 0.5 : 1 }}>
                Ask
              </button>
            </form>
            <a href="#projects" style={{ fontSize: 13, color: '#7d8494' }}>
              Or browse his projects yourself
            </a>
          </>
        )}
      </div>
    </section>
  )
}
