'use client'

// Her presence on screen. Browsers with WebGL get the 3D scene (components/CoreScene.tsx),
// loaded only when needed; the rest, and anyone waiting for it to load, get a 2D ring.

import { lazy, Suspense, useRef, useEffect, useSyncExternalStore, Component, type ReactNode } from 'react'
import { HUES, type PresenceProps as Props } from '@/lib/presence'

export type { PresenceState } from '@/lib/presence'

const CoreScene = lazy(() => import('./CoreScene'))

class ThreeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: unknown) { console.error('WebGL error:', error) }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

function Fallback2DRing({ state, energy, dormant = false, pulse = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({ state, energy, dormant, pulse })
  useEffect(() => { live.current = { state, energy, dormant, pulse } })
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const born = performance.now()
    let last = born
    let level = 0.1
    let hue = HUES.idle
    let turn = 0
    let glowing = live.current.dormant ? 0.4 : 1
    let seenPulse = live.current.pulse
    let ripples: number[] = []
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      const current = live.current.state
      const density = Math.min(2, window.devicePixelRatio || 1)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) { frame = requestAnimationFrame(draw); return }
      if (canvas.width !== Math.round(width * density) || canvas.height !== Math.round(height * density)) {
        canvas.width = Math.round(width * density); canvas.height = Math.round(height * density)
      }
      ctx.setTransform(density, 0, 0, density, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const arrived = calm ? 1 : Math.min(1, (now - born) / 1800)
      const entrance = 1 - Math.pow(1 - arrived, 3)
      if (live.current.pulse !== seenPulse) {
        seenPulse = live.current.pulse; if (!calm) ripples.push(now, now + 180)
      }
      let target = 0.08 + 0.04 * Math.sin(t * 1.2)
      if (current === 'listening') target = 0.2 + 0.07 * Math.sin(t * 3.2)
      if (current === 'thinking') target = 0.13
      if (current === 'talking') {
        const voice = live.current.energy() ?? 0.45 + 0.35 * Math.sin(t * 9) * Math.sin(t * 2.3)
        target = 0.15 + 0.85 * Math.max(0, voice)
      }
      if (live.current.dormant) target *= 0.5
      level += (target - level) * Math.min(1, dt * 14)
      hue += (HUES[current] - hue) * Math.min(1, dt * 4)
      turn += dt * (current === 'thinking' ? 1.7 : 0.15)
      glowing += ((live.current.dormant ? 0.4 : 1) - glowing) * Math.min(1, dt * 3)
      const cx = width / 2; const cy = height / 2; const radius = Math.min(width, height) * 0.2 * (0.7 + 0.3 * entrance)
      ctx.globalCompositeOperation = 'lighter'
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (1.1 + level * 0.6))
      glow.addColorStop(0, `hsla(${hue}, 90%, 70%, ${(0.08 + level * 0.22) * glowing * entrance})`)
      glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2); ctx.fill()
      const POINTS = 160; const drawn = Math.round(POINTS * entrance)
      for (let ring = 0; ring < 4; ring++) {
        const swing = radius * (0.035 + level * 0.5) * (calm ? 0.35 : 1) * (1 - ring * 0.15)
        ctx.beginPath()
        for (let i = 0; i <= drawn; i++) {
          const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2
          const ripple = Math.sin(angle * 3 + t * 1.3 + ring * 1.7 + turn) * 0.5 + Math.sin(angle * 5 - t * 1.9 + ring) * 0.3 + Math.sin(angle * 9 + t * 2.7 + ring * 2.3) * 0.2
          const r = radius + ripple * swing
          const x = cx + Math.cos(angle + turn * 0.3) * r
          const y = cy + Math.sin(angle + turn * 0.3) * r
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        if (arrived >= 1) ctx.closePath()
        ctx.strokeStyle = `hsla(${hue + ring * 14}, 85%, ${68 - ring * 4}%, ${(0.75 - ring * 0.14) * glowing})`
        ctx.lineWidth = 2 - ring * 0.3; ctx.shadowColor = `hsla(${hue}, 90%, 60%, ${0.9 * glowing})`; ctx.shadowBlur = (16 + level * 40) * glowing; ctx.stroke()
      }
      if (current === 'thinking') {
        ctx.lineWidth = 2; ctx.strokeStyle = `hsla(${hue + 20}, 90%, 75%, 0.8)`
        for (const offset of [0, Math.PI]) {
          ctx.beginPath(); ctx.arc(cx, cy, radius * 1.32, turn * 1.6 + offset, turn * 1.6 + offset + 0.9); ctx.stroke()
        }
      }
      ripples = ripples.filter((start) => now - start < 1200)
      for (const start of ripples) {
        const age = (now - start) / 1200; if (age < 0) continue
        ctx.beginPath(); ctx.arc(cx, cy, radius * (1 + age * 2.4), 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 90%, 78%, ${(1 - age) * 0.55})`; ctx.lineWidth = 2 * (1 - age) + 0.5; ctx.shadowBlur = 24; ctx.stroke()
      }
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over'; frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
}

const noSubscribe = () => () => {}

let webgl: boolean | undefined
function hasWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement('canvas')
      webgl = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    } catch {
      webgl = false
    }
  }
  return webgl
}

export default function ThreeDPresence({ state, energy, dormant = false, pulse = 0 }: Props) {
  // null on the server and during hydration, then whether this browser can do WebGL
  const canUseThree = useSyncExternalStore(noSubscribe, hasWebGL, () => null)
  const fallback = <Fallback2DRing state={state} energy={energy} dormant={dormant} pulse={pulse} />
  const containerStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    position: 'relative',
    // her light is added onto the backdrop behind her, and the black around her disappears
    mixBlendMode: 'screen',
    // fades the scene out toward the edges, so stray particles never stop at a hard line
    maskImage: 'radial-gradient(circle closest-side, #000 82%, transparent 100%)',
    WebkitMaskImage: 'radial-gradient(circle closest-side, #000 82%, transparent 100%)',
  }
  if (canUseThree === null) return <div style={containerStyle} />
  if (!canUseThree) return <div style={containerStyle}>{fallback}</div>
  return (
    <div style={containerStyle} role="img" aria-label={`D.I.K.S.H.A is ${state}`}>
      <ThreeErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <CoreScene state={state} energy={energy} dormant={dormant} pulse={pulse} />
        </Suspense>
      </ThreeErrorBoundary>
    </div>
  )
}
