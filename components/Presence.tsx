'use client'

import { useEffect, useRef } from 'react'

export type PresenceState = 'idle' | 'listening' | 'thinking' | 'talking'

// one colour per state, as hue angles: calm blue, attentive teal, violet while thinking, warm rose when she speaks
const HUES: Record<PresenceState, number> = { idle: 212, listening: 172, thinking: 262, talking: 342 }

type Props = {
  state: PresenceState
  // how loud her voice is right now (0 to 1), or null when there's no audio to measure
  energy: () => number | null
  // dormant: dimmed and quiet, waiting to be woken
  dormant?: boolean
  // change this number to send a burst of light out from the ring (her "waking up")
  pulse?: number
}

const ENTRANCE_MS = 1800 // how long the ring takes to draw itself in on arrival
const RIPPLE_MS = 1200

// D.I.K.S.H.A has no body. This ring of light is how you can tell she's there:
// it breathes when idle, tightens while listening, turns while thinking, and moves with her voice.
export default function Presence({ state, energy, dormant = false, pulse = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // the drawing loop runs outside React, so it reads the latest props from here
  const live = useRef({ state, energy, dormant, pulse })
  useEffect(() => {
    live.current = { state, energy, dormant, pulse }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const born = performance.now()
    let last = born
    let level = 0.1 // how lively the ring is, eased toward a target each frame
    let hue = HUES.idle
    let turn = 0
    let glowing = live.current.dormant ? 0.4 : 1 // overall brightness
    let seenPulse = live.current.pulse
    let ripples: number[] = [] // start times of the bursts of light currently spreading out

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      const current = live.current.state

      // keep the canvas sharp on high-density screens
      const density = Math.min(2, window.devicePixelRatio || 1)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * density) || canvas.height !== Math.round(height * density)) {
        canvas.width = Math.round(width * density)
        canvas.height = Math.round(height * density)
      }
      ctx.setTransform(density, 0, 0, density, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // entrance: the ring draws itself in, starting from the top
      const arrived = calm ? 1 : Math.min(1, (now - born) / ENTRANCE_MS)
      const entrance = 1 - Math.pow(1 - arrived, 3)

      // a new pulse sends out two bursts of light, one just behind the other
      if (live.current.pulse !== seenPulse) {
        seenPulse = live.current.pulse
        if (!calm) ripples.push(now, now + 180)
      }

      let target = 0.08 + 0.04 * Math.sin(t * 1.2) // idle: slow breathing
      if (current === 'listening') target = 0.2 + 0.07 * Math.sin(t * 3.2)
      if (current === 'thinking') target = 0.13
      if (current === 'talking') {
        // follow her real voice, or a speech-like rhythm when the audio can't be measured
        const voice = live.current.energy() ?? 0.45 + 0.35 * Math.sin(t * 9) * Math.sin(t * 2.3)
        target = 0.15 + 0.85 * Math.max(0, voice)
      }
      if (live.current.dormant) target *= 0.5
      level += (target - level) * Math.min(1, dt * 14)
      hue += (HUES[current] - hue) * Math.min(1, dt * 4)
      turn += dt * (current === 'thinking' ? 1.7 : 0.15)
      glowing += ((live.current.dormant ? 0.4 : 1) - glowing) * Math.min(1, dt * 3)

      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width, height) * 0.2 * (0.7 + 0.3 * entrance)
      const motion = calm ? 0.35 : 1

      ctx.globalCompositeOperation = 'lighter' // overlapping lines add up to a glow

      // soft light at the centre
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (1.1 + level * 0.6))
      glow.addColorStop(0, `hsla(${hue}, 90%, 70%, ${(0.08 + level * 0.22) * glowing * entrance})`)
      glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2)
      ctx.fill()

      // four rings, each rippling slightly differently
      const POINTS = 160
      const drawn = Math.round(POINTS * entrance)
      for (let ring = 0; ring < 4; ring++) {
        const swing = radius * (0.035 + level * 0.5) * motion * (1 - ring * 0.15)
        ctx.beginPath()
        for (let i = 0; i <= drawn; i++) {
          const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2
          const ripple =
            Math.sin(angle * 3 + t * 1.3 + ring * 1.7 + turn) * 0.5 +
            Math.sin(angle * 5 - t * 1.9 + ring) * 0.3 +
            Math.sin(angle * 9 + t * 2.7 + ring * 2.3) * 0.2
          const r = radius + ripple * swing
          const x = cx + Math.cos(angle + turn * 0.3) * r
          const y = cy + Math.sin(angle + turn * 0.3) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        if (arrived >= 1) ctx.closePath()
        ctx.strokeStyle = `hsla(${hue + ring * 14}, 85%, ${68 - ring * 4}%, ${(0.75 - ring * 0.14) * glowing})`
        ctx.lineWidth = 2 - ring * 0.3
        ctx.shadowColor = `hsla(${hue}, 90%, 60%, ${0.9 * glowing})`
        ctx.shadowBlur = (16 + level * 40) * glowing
        ctx.stroke()
      }

      // while thinking, two arcs circle the ring
      if (current === 'thinking') {
        ctx.lineWidth = 2
        ctx.strokeStyle = `hsla(${hue + 20}, 90%, 75%, 0.8)`
        for (const offset of [0, Math.PI]) {
          ctx.beginPath()
          ctx.arc(cx, cy, radius * 1.32, turn * 1.6 + offset, turn * 1.6 + offset + 0.9)
          ctx.stroke()
        }
      }

      // bursts of light spreading outward and fading
      ripples = ripples.filter((start) => now - start < RIPPLE_MS)
      for (const start of ripples) {
        const age = (now - start) / RIPPLE_MS
        if (age < 0) continue // the second burst hasn't left yet
        ctx.beginPath()
        ctx.arc(cx, cy, radius * (1 + age * 2.4), 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 90%, 78%, ${(1 - age) * 0.55})`
        ctx.lineWidth = 2 * (1 - age) + 0.5
        ctx.shadowBlur = 24
        ctx.stroke()
      }

      ctx.shadowBlur = 0
      ctx.globalCompositeOperation = 'source-over'
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`D.I.K.S.H.A is ${state}`}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
