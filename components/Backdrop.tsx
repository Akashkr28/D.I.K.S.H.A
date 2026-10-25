'use client'

// The space behind D.I.K.S.H.A, styled as a neural interface: a living network whose signals
// fire faster when she thinks or speaks, a perspective grid floor, a HUD ring around her,
// readouts in the corners, a passing scan line, grain and a vignette.
// Decorative only: hidden from screen readers and ignores the pointer.

import { useEffect, useRef } from 'react'
import { HUES, fakeVoice, type PresenceState } from '@/lib/presence'

type Node = { x: number; y: number; vx: number; vy: number; flash: number }
type Signal = { from: number; to: number; born: number; life: number; hops: number }

const NODE_AREA = 13000 // one node per this many square pixels
const MAX_NODES = 120
const LINK = 150 // nodes closer than this (in px) are linked
const MAX_SIGNALS = 60

// how many signals start each second, by state
const FIRING: Record<PresenceState, number> = { idle: 0.8, listening: 2, thinking: 6, talking: 2 }

type Live = { state: PresenceState; energy: () => number | null }

function NeuralField({ live }: { live: { current: Live } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mouse = { x: -9999, y: -9999 }
    let nodes: Node[] = []
    let signals: Signal[] = []
    let width = 0
    let height = 0
    let frame = 0
    let last = performance.now()
    let owed = 0 // fractional signals carried over between frames
    let hue = HUES.idle
    let visible = true

    const resize = () => {
      const density = Math.min(2, window.devicePixelRatio || 1)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      ctx.setTransform(density, 0, 0, density, 0, 0)
      const count = Math.min(MAX_NODES, Math.round((width * height) / NODE_AREA))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        flash: 0,
      }))
      signals = []
    }

    // the neighbours a node is linked to right now
    const neighbours = (index: number) => {
      const a = nodes[index]
      const found: number[] = []
      nodes.forEach((b, j) => {
        if (j !== index && Math.hypot(a.x - b.x, a.y - b.y) < LINK) found.push(j)
      })
      return found
    }

    const fire = (from: number, now: number, hops: number) => {
      const options = neighbours(from)
      if (!options.length || signals.length >= MAX_SIGNALS) return
      const to = options[Math.floor(Math.random() * options.length)]
      signals.push({ from, to, born: now, life: 500 + Math.random() * 700, hops })
    }

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!visible) return
      const { state, energy } = live.current
      hue += (HUES[state] - hue) * Math.min(1, dt * 2)
      ctx.clearRect(0, 0, width, height)

      // drift, bouncing softly off the edges
      if (!calm) {
        for (const node of nodes) {
          node.x += node.vx * dt
          node.y += node.vy * dt
          if (node.x < 0 || node.x > width) node.vx *= -1
          if (node.y < 0 || node.y > height) node.vy *= -1
          node.flash = Math.max(0, node.flash - dt * 2.5)
        }
      }

      // links between nearby nodes, fainter the longer they are
      ctx.lineWidth = 1
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d >= LINK) continue
          ctx.strokeStyle = `hsla(${hue}, 70%, 70%, ${(1 - d / LINK) * 0.16})`
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        // the cursor joins the network too
        const a = nodes[i]
        const d = Math.hypot(a.x - mouse.x, a.y - mouse.y)
        if (d < LINK * 1.2) {
          ctx.strokeStyle = `hsla(${hue}, 85%, 75%, ${(1 - d / (LINK * 1.2)) * 0.35})`
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(mouse.x, mouse.y)
          ctx.stroke()
        }
      }

      // new signals: steady when idle, busy when thinking, and with her voice when speaking
      if (!calm && nodes.length) {
        let rate = FIRING[state]
        if (state === 'talking') rate += Math.max(0, energy() ?? fakeVoice(now / 1000)) * 6
        owed += rate * dt
        while (owed >= 1) {
          owed -= 1
          fire(Math.floor(Math.random() * nodes.length), now, 0)
        }
      }

      // signals travel along their link; on arrival the node lights up and may pass it on
      signals = signals.filter((signal) => {
        const progress = (now - signal.born) / signal.life
        const a = nodes[signal.from]
        const b = nodes[signal.to]
        if (!a || !b) return false
        if (progress >= 1) {
          b.flash = 1
          if (signal.hops < 4 && Math.random() < 0.55) fire(signal.to, now, signal.hops + 1)
          return false
        }
        const x = a.x + (b.x - a.x) * progress
        const y = a.y + (b.y - a.y) * progress
        // a bright head with a short trail behind it
        const tail = Math.max(0, progress - 0.18)
        const gradient = ctx.createLinearGradient(a.x + (b.x - a.x) * tail, a.y + (b.y - a.y) * tail, x, y)
        gradient.addColorStop(0, `hsla(${hue}, 90%, 75%, 0)`)
        gradient.addColorStop(1, `hsla(${hue}, 90%, 80%, 0.9)`)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(a.x + (b.x - a.x) * tail, a.y + (b.y - a.y) * tail)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.fillStyle = `hsla(${hue}, 100%, 88%, 0.95)`
        ctx.beginPath()
        ctx.arc(x, y, 1.6, 0, Math.PI * 2)
        ctx.fill()
        return true
      })

      // the nodes themselves, flaring when a signal reaches them
      for (const node of nodes) {
        ctx.fillStyle = `hsla(${hue}, 80%, ${70 + node.flash * 25}%, ${0.35 + node.flash * 0.65})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, 1.3 + node.flash * 2.2, 0, Math.PI * 2)
        ctx.fill()
        if (node.flash > 0.05) {
          ctx.strokeStyle = `hsla(${hue}, 90%, 75%, ${node.flash * 0.5})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, 3 + (1 - node.flash) * 10, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    const onMove = (e: MouseEvent) => {
      const box = canvas.getBoundingClientRect()
      mouse.x = e.clientX - box.left
      mouse.y = e.clientY - box.top
    }
    // no point animating a network nobody can see once the visitor has scrolled down
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })

    resize()
    watcher.observe(canvas)
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      watcher.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [live])

  return <canvas ref={canvasRef} className="backdrop-layer neural" />
}

const READOUT: Record<PresenceState, string> = { idle: 'STANDBY', listening: 'LISTENING', thinking: 'PROCESSING', talking: 'SPEAKING' }

export default function Backdrop({ state, energy }: Live) {
  // the drawing loop runs outside React, so it reads the latest props from here
  const live = useRef<Live>({ state, energy })
  useEffect(() => {
    live.current = { state, energy }
  })

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-glow" />
      <NeuralField live={live} />
      <div className="floor-wrap">
        <div className="floor" />
      </div>
      <div className="floor-horizon" />
      <div className="scan" />
      <div className="hud-corners">
        <span className="hud-label hud-tl">D.I.K.S.H.A // NEURAL INTERFACE</span>
        <span className="hud-label hud-tr">
          <i className="hud-dot" /> {READOUT[state]}
        </span>
        <span className="hud-label hud-bl">CORE · CLAUDE</span>
        <span className="hud-label hud-br">VOICE · ELEVENLABS</span>
      </div>
      <div className="backdrop-layer grain" />
      <div className="backdrop-layer vignette" />
    </div>
  )
}

// rounded, because server and browser can disagree on the last digits of Math.cos,
// and the rendered SVG has to match exactly when the page hydrates
const at = (n: number) => Math.round(n * 1000) / 1000

// a targeting-display ring that sits around her, inside the presence area
export function HudRing() {
  const ticks = Array.from({ length: 72 }, (_, i) => i)
  return (
    <svg className="hud-ring" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.3" />
      {ticks.map((i) => {
        const angle = (i / ticks.length) * Math.PI * 2
        const inner = i % 6 === 0 ? 91.5 : 94
        return (
          <line
            key={i}
            x1={at(100 + Math.cos(angle) * inner)}
            y1={at(100 + Math.sin(angle) * inner)}
            x2={at(100 + Math.cos(angle) * 96)}
            y2={at(100 + Math.sin(angle) * 96)}
            stroke="currentColor"
            strokeOpacity={i % 6 === 0 ? 0.5 : 0.22}
            strokeWidth="0.35"
          />
        )
      })}
      <g className="hud-spin-slow">
        <circle cx="100" cy="100" r="87" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.4" strokeDasharray="22 6 3 6" />
      </g>
      <g className="hud-spin-fast">
        <circle cx="100" cy="100" r="99" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="0.6" strokeDasharray="40 582" strokeLinecap="round" />
      </g>
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} d="M100 1.5 l2 3 h-4 z" fill="currentColor" fillOpacity="0.6" transform={`rotate(${deg} 100 100)`} />
      ))}
    </svg>
  )
}
