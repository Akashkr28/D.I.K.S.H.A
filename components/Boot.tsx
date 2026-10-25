'use client'

// The opening moment: D.I.K.S.H.A boots while the heavy parts of the page load. Every line
// it prints is a real step that has to finish. Then the visitor enters with sound or without;
// entering is the click browsers require before a page may play audio. If nobody chooses,
// it enters without sound on its own after a few seconds.

import { useEffect, useRef, useState } from 'react'

export type EntryMode = 'sound' | 'silent' | 'auto'

const AUTO_ENTER_S = 7
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

type Step = { label: string; done: boolean }

export default function Boot({ onEnter }: { onEnter: (mode: EntryMode) => void }) {
  const [steps, setSteps] = useState<Step[]>([
    { label: 'loading neural core', done: false },
    { label: 'loading typefaces', done: false },
    { label: 'establishing presence', done: false },
  ])
  const [shown, setShown] = useState(0) // the counter on screen, easing toward real progress
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_ENTER_S)
  const enterRef = useRef<HTMLButtonElement>(null)
  const chosen = useRef(false)
  const shownRef = useRef(0)

  const finished = steps.filter((step) => step.done).length
  const ready = finished === steps.length
  const progress = finished / steps.length

  // the real work. each step ticks off when its promise settles.
  useEffect(() => {
    const mark = (index: number) => setSteps((current) => current.map((step, i) => (i === index ? { ...step, done: true } : step)))
    const scene = import('./CoreScene').catch(() => null) // ThreeDPresence asks for the same module, so this is shared
    void scene.then(() => mark(0))
    void document.fonts.ready.then(() => mark(1))
    // a short beat so the sequence reads, then her presence is ready
    void Promise.all([scene, document.fonts.ready, wait(1400)]).then(() => mark(2))
  }, [])

  // the counter glides toward the real progress, then rests
  useEffect(() => {
    const target = progress * 100
    let frame = 0
    const tick = () => {
      const next = shownRef.current + (target - shownRef.current) * 0.08
      shownRef.current = Math.abs(target - next) < 0.5 ? target : next
      setShown(shownRef.current)
      if (shownRef.current !== target) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [progress])

  function enter(mode: EntryMode) {
    if (chosen.current) return
    chosen.current = true
    onEnter(mode)
    setLeaving(true)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => setGone(true), calm ? 0 : 950)
  }
  // the countdown timer was set up once, so it reaches the latest enter() through this ref
  const enterLater = useRef(enter)
  useEffect(() => {
    enterLater.current = enter
  })

  // once ready: focus the main button, and count down to entering on our own
  useEffect(() => {
    if (!ready) return
    enterRef.current?.focus({ preventScroll: true })
    let left = AUTO_ENTER_S
    const timer = window.setInterval(() => {
      left -= 1
      setCountdown(left)
      if (left <= 0) {
        window.clearInterval(timer)
        enterLater.current('auto')
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [ready])

  if (gone) return null

  return (
    <div className={`boot${leaving ? ' boot-leaving' : ''}`} role="dialog" aria-modal="true" aria-label="D.I.K.S.H.A is starting">
      <div className="boot-inner">
        <div className="boot-title">
          D.I.K.S.H.A <span>{'// NEURAL INTERFACE'}</span>
        </div>

        <ul className="boot-log">
          <li>
            <span>&gt; initialising interface</span>
            <b>ok</b>
          </li>
          {steps.map((step) => (
            <li key={step.label} className={step.done ? 'is-done' : ''}>
              <span>&gt; {step.label}</span>
              <b>{step.done ? 'ok' : '...'}</b>
            </li>
          ))}
        </ul>

        <div className="boot-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${shown / 100})` }} />
        </div>

        <div className="boot-foot">
          <div className="boot-count" aria-live="polite">
            {String(Math.round(shown)).padStart(3, '0')}
          </div>
          <div className={`boot-actions${ready ? ' is-ready' : ''}`}>
            <button ref={enterRef} type="button" className="boot-enter" disabled={!ready} onClick={() => enter('sound')} data-magnetic>
              Enter with sound
            </button>
            <button type="button" className="boot-quiet" disabled={!ready} onClick={() => enter('silent')}>
              Enter without sound
            </button>
            <a href="#projects" className="boot-quiet" onClick={() => enter('silent')}>
              Skip to projects
            </a>
            {ready && <span className="boot-auto">entering on its own in {countdown}s</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
